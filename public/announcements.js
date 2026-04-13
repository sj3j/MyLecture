(function() {
  const containerId = 'telegram-announcements-container';
  
  function init() {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.dir = 'rtl';
      container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      container.style.maxWidth = '600px';
      container.style.margin = '0 auto';
      container.style.padding = '20px';
      
      const target = document.getElementById('announcements-root') || document.body;
      target.appendChild(container);
    }
    
    fetchAndRender();
    // Auto-refresh every 5 minutes
    setInterval(fetchAndRender, 5 * 60 * 1000);
  }

  async function fetchAndRender() {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const response = await fetch('/announcements.json?t=' + new Date().getTime());
      if (!response.ok) throw new Error('Failed to fetch');
      const posts = await response.json();
      
      const now = new Date();
      const timeString = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      
      let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 1.5rem; color: #0f172a;">الإعلانات</h2>
          <span style="font-size: 0.875rem; color: #64748b; display: flex; align-items: center; gap: 4px;">
            🔄 آخر تحديث: ${timeString}
          </span>
        </div>
      `;

      if (!posts || posts.length === 0) {
        html += `
          <div style="text-align: center; padding: 40px; background: #fff; border-radius: 16px; border: 1px dashed #cbd5e1;">
            <p style="color: #64748b; margin: 0; font-weight: 500;">لا توجد إعلانات</p>
          </div>
        `;
      } else {
        html += '<div style="display: flex; flex-direction: column; gap: 16px;">';
        posts.forEach(post => {
          const date = new Date(post.date * 1000).toLocaleDateString('ar-EG', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          
          const content = post.text || post.caption || '';
          
          html += `
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <div style="width: 40px; height: 40px; background: #e0f2fe; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #0284c7; font-weight: bold;">
                  T
                </div>
                <div>
                  <h3 style="margin: 0; font-size: 1rem; color: #0f172a;">Telegram Channel</h3>
                  <p style="margin: 0; font-size: 0.75rem; color: #64748b;">${date}</p>
                </div>
              </div>
              
              <p style="margin: 0 0 12px 0; color: #334155; white-space: pre-wrap; line-height: 1.5;">${content}</p>
              
              ${post.photo_url ? `
                <div style="border-radius: 12px; overflow: hidden; border: 1px solid #f1f5f9; margin-top: 12px;">
                  <img src="${post.photo_url}" alt="Post image" style="width: 100%; height: auto; display: block;" />
                </div>
              ` : ''}
            </div>
          `;
        });
        html += '</div>';
      }
      
      container.innerHTML = html;
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
