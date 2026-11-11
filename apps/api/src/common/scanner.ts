import net from "node:net";

export function frameInstream(data: Buffer): Buffer {
  const parts: Buffer[] = [Buffer.from("zINSTREAM\0")];
  const chunkSize = 64 * 1024;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const slice = data.subarray(offset, Math.min(data.length, offset + chunkSize));
    const size = Buffer.alloc(4);
    size.writeUInt32BE(slice.length);
    parts.push(size, slice);
  }
  parts.push(Buffer.alloc(4));
  return Buffer.concat(parts);
}

export function interpretScan(response: string): "clean" | "infected" {
  if (response.includes("FOUND")) return "infected";
  if (response.includes("OK")) return "clean";
  throw new Error("SCAN_RESPONSE");
}

export function scanBuffer(host: string, port: number, data: Buffer, timeoutMs = 30_000): Promise<"clean" | "infected"> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("SCAN_TIMEOUT"));
    }, timeoutMs);
    let response = "";
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("end", () => {
      clearTimeout(timer);
      try {
        resolve(interpretScan(response));
      } catch (error) {
        reject(error);
      }
    });
    socket.end(frameInstream(data));
  });
}
