import { PROCESSING_QUEUE, type JobMessage } from "@madeye/shared-types";
import { createPrismaClient, PrismaClient } from "@madeye/database";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import amqp, { type Channel, type ChannelModel } from "amqplib";
import { Redis } from "ioredis";
import { Client } from "minio";
import { ENV, type Env } from "../env.js";
import { log } from "../logging.js";

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = createPrismaClient(env.DATABASE_URL);
  }

  async tenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

@Injectable()
export class ObjectStorage implements OnModuleDestroy {
  private readonly client: Client;
  readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    const endpoint = new URL(env.S3_ENDPOINT);
    this.bucket = env.S3_BUCKET;
    this.client = new Client({
      endPoint: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80,
      useSSL: endpoint.protocol === "https:",
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      region: env.S3_REGION,
    });
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) await this.client.makeBucket(this.bucket, "us-east-1");
  }

  put(key: string, body: Buffer, mediaType: string): Promise<unknown> {
    return this.client.putObject(this.bucket, key, body, body.length, { "Content-Type": mediaType });
  }

  get(key: string): Promise<NodeJS.ReadableStream> {
    return this.client.getObject(this.bucket, key);
  }

  remove(key: string): Promise<void> {
    return this.client.removeObject(this.bucket, key);
  }

  async onModuleDestroy(): Promise<void> {
    return undefined;
  }
}

@Injectable()
export class JobQueue implements OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  private async open(): Promise<Channel> {
    if (this.channel) return this.channel;
    this.connection = await amqp.connect(this.env.RABBITMQ_URL);
    this.connection.on("error", (error: Error) => {
      log("error", "rabbit_connection_error", { name: error.name });
      this.channel = null;
      this.connection = null;
    });
    this.channel = await this.connection.createChannel();
    await this.channel.assertQueue(PROCESSING_QUEUE, { durable: true });
    return this.channel;
  }

  async publish(message: JobMessage): Promise<void> {
    const channel = await this.open();
    const sent = channel.sendToQueue(PROCESSING_QUEUE, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: "application/json",
    });
    if (!sent) throw new Error("QUEUE_NOT_WRITABLE");
  }

  async ping(): Promise<boolean> {
    try {
      await this.open();
      return true;
    } catch {
      this.channel = null;
      this.connection = null;
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }
}

@Injectable()
export class RateLimit implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }

  async hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (this.redis.status === "wait") await this.redis.connect();
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds);
    return count <= limit;
  }

  async ping(): Promise<boolean> {
    try {
      if (this.redis.status === "wait") await this.redis.connect();
      return (await this.redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
