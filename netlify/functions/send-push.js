const admin = require('firebase-admin');

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        // 1. Initialize Firebase using the secure Netlify Environment Variable
        if (!admin.apps.length) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }

        // 2. Grab the data sent from your admin.js frontend
        const { uid, title, body, link } = JSON.parse(event.body);

        // 3. Look up the user in Firestore to get their phone/desktop tokens
        const userDoc = await admin.firestore().collection('users').doc(uid).get();
        if (!userDoc.exists) return { statusCode: 404, body: 'User not found' };

        const tokens = userDoc.data().fcmTokens || [];
        if (tokens.length === 0) return { statusCode: 400, body: 'User has no registered devices.' };

        // 4. Send the Push Notification to Apple/Android via FCM
        const payload = {
            notification: { title, body },
            data: { url: link || '/' },
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(payload);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `${response.successCount} devices pinged successfully.` })
        };

    } catch (error) {
        console.error("Push Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
