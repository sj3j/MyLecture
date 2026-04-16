import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { filename, contentType } = req.query;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: "Filename is required" });
  }

  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_ACCESS_KEY || !process.env.CLOUDFLARE_SECRET_KEY) {
    return res.status(500).json({ error: "Cloudflare R2 credentials are not configured on the server." });
  }

  try {
    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY,
        secretAccessKey: process.env.CLOUDFLARE_SECRET_KEY,
      },
    });

    const bucketName = process.env.R2_BUCKET_NAME || "lecture-audio";
    const publicUrlBase = process.env.R2_PUBLIC_URL || "";
    
    const safeFileName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const objectKey = `records/${Date.now()}_${safeFileName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: (contentType) || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    const publicUrl = publicUrlBase.endsWith('/') 
      ? `${publicUrlBase}${objectKey}` 
      : `${publicUrlBase}/${objectKey}`;

    return res.status(200).json({ uploadUrl, publicUrl, objectKey });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return res.status(500).json({ error: "Failed to generate upload URL" });
  }
}
