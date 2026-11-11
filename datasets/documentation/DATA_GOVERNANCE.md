# Data governance

Customer documents uploaded to MAD-EYE are not training data.

The upload and job path writes only to object storage and PostgreSQL. It does not copy bytes into `datasets/`. A future training run requires a separate manifest that names the dataset version, the license, the provenance, and the split. That manifest is not created from a tenant upload.

No production dataset is stored in this repository. Large files and model weights stay outside Git.
