import { useState, useEffect, useCallback } from 'react';

const CACHE_NAME = 'offline-pdfs-v1';

export function useOfflinePDF(pdfUrl: string | undefined, lectureId?: string) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [offlineUrl, setOfflineUrl] = useState<string | null>(null);

  const checkIsDownloaded = useCallback(async () => {
    if (!pdfUrl || !('caches' in window)) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(pdfUrl);
      if (response) {
        setIsDownloaded(true);
        if (lectureId) localStorage.setItem(`pdf_${lectureId}`, 'true');
        // Create a blob URL for offline viewing
        const blob = await response.blob();
        setOfflineUrl(URL.createObjectURL(blob));
      } else {
        setIsDownloaded(false);
        setOfflineUrl(null);
        if (lectureId) localStorage.removeItem(`pdf_${lectureId}`);
      }
    } catch (error) {
      console.error('Error checking cache:', error);
    }
  }, [pdfUrl, lectureId]);

  useEffect(() => {
    checkIsDownloaded();
    
    // Cleanup blob URL on unmount
    return () => {
      if (offlineUrl) {
        URL.revokeObjectURL(offlineUrl);
      }
    };
  }, [checkIsDownloaded]);

  const downloadPDF = async () => {
    if (!pdfUrl || !('caches' in window)) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    
    try {
      // Fetch the PDF
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      
      // If we can't track progress, just cache it directly
      if (total === 0 || !response.body) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(pdfUrl, response);
        await checkIsDownloaded();
        setIsDownloading(false);
        return;
      }

      // Track progress
      const reader = response.body.getReader();
      const chunks = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        setDownloadProgress(Math.round((loaded / total) * 100));
      }
      
      const blob = new Blob(chunks, { type: 'application/pdf' });
      const cacheResponse = new Response(blob, {
        headers: { 'Content-Type': 'application/pdf' }
      });
      
      const cache = await caches.open(CACHE_NAME);
      await cache.put(pdfUrl, cacheResponse);
      
      await checkIsDownloaded();
    } catch (error) {
      console.error('Error downloading PDF:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        alert('Failed to download PDF. This is usually caused by missing CORS configuration on your Firebase Storage bucket. Please see the console for instructions on how to fix this.');
        console.info(
          '%cHow to fix the CORS error:', 'font-size: 16px; font-weight: bold;',
          '\n\n1. Go to the Google Cloud Console: https://console.cloud.google.com/',
          '\n2. Click the terminal icon (Activate Cloud Shell) in the top right.',
          '\n3. Run this command to create a cors.json file:',
          '\n   echo \'[{"origin": ["*"],"method": ["GET"],"maxAgeSeconds": 3600}]\' > cors.json',
          '\n4. Run this command to apply it to your bucket:',
          '\n   gsutil cors set cors.json gs://mylectures-app.firebasestorage.app'
        );
      } else {
        alert('Failed to download PDF for offline viewing.');
      }
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const removePDF = async () => {
    if (!pdfUrl || !('caches' in window)) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(pdfUrl);
      if (offlineUrl) {
        URL.revokeObjectURL(offlineUrl);
      }
      setIsDownloaded(false);
      setOfflineUrl(null);
      if (lectureId) localStorage.removeItem(`pdf_${lectureId}`);
    } catch (error) {
      console.error('Error removing PDF from cache:', error);
    }
  };

  return {
    isDownloaded,
    isDownloading,
    downloadProgress,
    offlineUrl,
    downloadPDF,
    removePDF
  };
}
