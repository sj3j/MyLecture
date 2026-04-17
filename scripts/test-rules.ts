import admin from 'firebase-admin';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { request } from 'https';
dotenv.config();

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });

  const source = fs.readFileSync('firestore.rules', 'utf8');

  // Let's use the REST API to get better error messages
  admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }).getAccessToken().then(tokenResult => {
      const token = tokenResult.access_token;
      
      const req = request({
        hostname: 'firebaserules.googleapis.com',
        path: `/v1/projects/${process.env.FIREBASE_PROJECT_ID}/rulesets`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }, res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => {
              console.log(res.statusCode, body);
          });
      });
      
      req.write(JSON.stringify({
        source: {
            files: [{
                name: 'firestore.rules',
                content: source
            }]
        }
      }));
      req.end();
      
      // Release it
      setTimeout(() => {
        const req2 = request({
            hostname: 'firebaserules.googleapis.com',
            path: `/v1/projects/${process.env.FIREBASE_PROJECT_ID}/releases/cloud.firestore`,
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }, res2 => {
              let body2 = '';
              res2.on('data', d => body2 += d);
              res2.on('end', () => console.log('Release:', res2.statusCode, body2));
          });
          req2.write(JSON.stringify({
              release: {
                name: `projects/${process.env.FIREBASE_PROJECT_ID}/releases/cloud.firestore`,
                rulesetName: `projects/${process.env.FIREBASE_PROJECT_ID}/rulesets/fe4fc971-9873-45ef-a78f-724c34214986`
              }
          }));
          req2.end();
      }, 5000);
  });

} catch (e) {
  console.log('Failed:', e);
}
