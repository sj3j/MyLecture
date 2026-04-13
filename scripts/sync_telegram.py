import os
import json
import requests

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
CHANNEL_ID = os.environ.get('TELEGRAM_CHANNEL_ID')
JSON_PATH = 'public/announcements.json'

def get_file_url(file_id):
    res = requests.get(f'https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={file_id}').json()
    if res.get('ok'):
        file_path = res['result']['file_path']
        return f'https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}'
    return None

def main():
    if not BOT_TOKEN or not CHANNEL_ID:
        print("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID")
        return

    # Load existing posts
    existing_posts = []
    if os.path.exists(JSON_PATH):
        with open(JSON_PATH, 'r', encoding='utf-8') as f:
            try:
                existing_posts = json.load(f)
            except:
                pass
    
    seen_ids = {post['id'] for post in existing_posts}
    
    # Fetch updates from Telegram
    try:
        res = requests.get(f'https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?allowed_updates=["channel_post"]').json()
    except Exception as e:
        print(f"Error fetching updates: {e}")
        return
    
    if not res.get('ok'):
        print("Error from Telegram API:", res)
        if res.get('error_code') == 409:
            print("Conflict: Webhook is active. You must delete the webhook to use getUpdates.")
            print(f"Run: curl https://api.telegram.org/bot{BOT_TOKEN}/deleteWebhook")
        return
        
    new_posts = []
    highest_update_id = 0
    
    for update in res.get('result', []):
        highest_update_id = max(highest_update_id, update['update_id'])
        if 'channel_post' in update:
            post = update['channel_post']
            chat_id = str(post['chat']['id'])
            
            if chat_id != str(CHANNEL_ID):
                continue
                
            msg_id = post['message_id']
            if msg_id in seen_ids:
                continue
                
            post_data = {
                'id': msg_id,
                'date': post['date'],
                'type': 'text',
                'text': post.get('text', ''),
                'caption': post.get('caption', ''),
                'photo_url': None
            }
            
            if 'photo' in post:
                post_data['type'] = 'photo'
                # Get highest resolution photo
                photo = sorted(post['photo'], key=lambda x: x['file_size'])[-1]
                post_data['photo_url'] = get_file_url(photo['file_id'])
                
            new_posts.append(post_data)
            seen_ids.add(msg_id)
            
    if new_posts:
        all_posts = existing_posts + new_posts
        # Sort by newest first
        all_posts.sort(key=lambda x: x['date'], reverse=True)
        
        os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
        with open(JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(all_posts, f, ensure_ascii=False, indent=2)
            
        # Acknowledge updates so they aren't fetched again
        requests.get(f'https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?offset={highest_update_id + 1}')
        print(f"Added {len(new_posts)} new posts.")
    else:
        print("No new posts found.")

if __name__ == '__main__':
    main()
