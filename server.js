const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database helper functions
function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ urls: [] }, null, 2));
      return { urls: [] };
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database:', err);
    return { urls: [] };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing database:', err);
  }
}

// Helper to generate unique short codes
function generateShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const db = readDb();
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    let tempCode = '';
    for (let i = 0; i < 6; i++) {
      tempCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const exists = db.urls.some(item => item.code === tempCode);
    if (!exists) {
      code = tempCode;
      isUnique = true;
    }
  }
  return code;
}

// User-Agent parser for basic analytics
function parseUserAgent(ua) {
  if (!ua) return { browser: 'Direct/Unknown', device: 'Desktop' };
  
  let browser = 'Other';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Chrome') && !ua.includes('Chromium')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edge') || ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('MSIE') || ua.includes('Trident')) browser = 'IE';
  
  let device = 'Desktop';
  if (ua.includes('Mobi') || ua.includes('Android') || ua.includes('iPhone')) {
    device = 'Mobile';
  } else if (ua.includes('Tablet') || ua.includes('iPad') || ua.includes('PlayBook')) {
    device = 'Tablet';
  }
  
  return { browser, device };
}

// API Routes

// 1. Create a shortened URL
app.post('/api/shorten', (req, res) => {
  let { longUrl, customCode, expiresAt } = req.body;
  
  if (!longUrl) {
    return res.status(400).json({ error: 'Long URL is required' });
  }

  let urlToSave = longUrl.trim();
  if (!/^https?:\/\//i.test(urlToSave)) {
    if (/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/i.test(urlToSave)) {
      urlToSave = 'https://' + urlToSave;
    } else {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
  }

  try {
    new URL(urlToSave);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const db = readDb();
  let code = '';

  if (customCode) {
    const cleanCode = customCode.trim().replace(/[^a-zA-Z0-9\-_]/g, '');
    if (cleanCode.length < 3 || cleanCode.length > 20) {
      return res.status(400).json({ error: 'Custom alias must be between 3 and 20 alphanumeric characters, dashes, or underscores' });
    }
    
    const reservedWords = ['api', 'static', 'assets', 'favicon.ico'];
    if (reservedWords.includes(cleanCode.toLowerCase())) {
      return res.status(400).json({ error: 'This alias is reserved and cannot be used' });
    }

    const exists = db.urls.some(item => item.code.toLowerCase() === cleanCode.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: 'Custom alias is already in use' });
    }
    code = cleanCode;
  } else {
    code = generateShortCode();
  }

  let expiryDate = null;
  if (expiresAt) {
    const parsedDate = new Date(expiresAt);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid expiration date' });
    }
    if (parsedDate < new Date()) {
      return res.status(400).json({ error: 'Expiration date must be in the future' });
    }
    expiryDate = parsedDate.toISOString();
  }

  const newUrlItem = {
    id: '_' + Math.random().toString(36).substr(2, 9),
    code,
    longUrl: urlToSave,
    custom: !!customCode,
    createdAt: new Date().toISOString(),
    expiresAt: expiryDate,
    clicks: 0,
    visits: []
  };

  db.urls.push(newUrlItem);
  writeDb(db);

  res.status(201).json({
    message: 'Short URL created successfully',
    shortUrl: `${req.protocol}://${req.get('host')}/${code}`,
    code,
    longUrl: urlToSave,
    expiresAt: expiryDate
  });
});

// 2. Get all shortened URLs
app.get('/api/urls', (req, res) => {
  const db = readDb();
  const summaryList = db.urls.map(item => {
    const isExpired = item.expiresAt ? new Date(item.expiresAt) < new Date() : false;
    return {
      id: item.id,
      code: item.code,
      longUrl: item.longUrl,
      custom: item.custom,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      clicks: item.clicks,
      isExpired
    };
  });
  summaryList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(summaryList);
});

// 3. Get detailed stats for a specific short code
app.get('/api/stats/:code', (req, res) => {
  const { code } = req.params;
  const db = readDb();
  const item = db.urls.find(u => u.code.toLowerCase() === code.toLowerCase());

  if (!item) {
    return res.status(404).json({ error: 'Short URL not found' });
  }

  const isExpired = item.expiresAt ? new Date(item.expiresAt) < new Date() : false;

  res.json({
    id: item.id,
    code: item.code,
    longUrl: item.longUrl,
    custom: item.custom,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    clicks: item.clicks,
    isExpired,
    visits: item.visits
  });
});

// 4. Delete a shortened URL
app.delete('/api/urls/:code', (req, res) => {
  const { code } = req.params;
  const db = readDb();
  const index = db.urls.findIndex(u => u.code.toLowerCase() === code.toLowerCase());

  if (index === -1) {
    return res.status(404).json({ error: 'Short URL not found' });
  }

  db.urls.splice(index, 1);
  writeDb(db);

  res.json({ message: 'Short URL deleted successfully', code });
});

// 5. Redirect handler
app.get('/:code', (req, res, next) => {
  const { code } = req.params;
  const db = readDb();
  const index = db.urls.findIndex(u => u.code.toLowerCase() === code.toLowerCase());

  if (index === -1) {
    return next();
  }

  const item = db.urls[index];

  if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
    return res.status(410).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Link Expired - LuminaLink</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: radial-gradient(circle at center, #1a153b 0%, #0b071e 100%);
            color: #ffffff;
            font-family: 'Outfit', sans-serif;
            text-align: center;
          }
          .card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 40px;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
            animation: fadeIn 0.8s ease;
          }
          h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #ff5e62 0%, #ff9966 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          p {
            color: #b0aebc;
            font-size: 1.1rem;
            line-height: 1.6;
            margin-bottom: 30px;
          }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #7f00ff 0%, #e100ff 100%);
            color: #fff;
            text-decoration: none;
            padding: 12px 30px;
            border-radius: 50px;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(225, 0, 255, 0.4);
            transition: all 0.3s ease;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(225, 0, 255, 0.6);
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Link Expired</h1>
          <p>This shortened link has passed its scheduled expiration date and is no longer accessible.</p>
          <a href="/" class="btn">Create New Link</a>
        </div>
      </body>
      </html>
    `);
  }

  const ua = req.get('User-Agent');
  const parsedUa = parseUserAgent(ua);
  const referrer = req.get('Referer') || 'Direct';
  
  item.clicks += 1;
  item.visits.push({
    timestamp: new Date().toISOString(),
    referrer: referrer.split('/')[2] || referrer,
    browser: parsedUa.browser,
    device: parsedUa.device
  });

  db.urls[index] = item;
  writeDb(db);

  res.redirect(302, item.longUrl);
});

// Custom 404 page for unmatched codes
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>URL Not Found - LuminaLink</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
      <style>
        body {
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: radial-gradient(circle at center, #1a153b 0%, #0b071e 100%);
          color: #ffffff;
          font-family: 'Outfit', sans-serif;
          text-align: center;
        }
        .card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 40px;
          max-width: 450px;
          width: 90%;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
          animation: fadeIn 0.8s ease;
        }
        h1 {
          font-size: 2.5rem;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #00c6ff 0%, #0072ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p {
          color: #b0aebc;
          font-size: 1.1rem;
          line-height: 1.6;
          margin-bottom: 30px;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #7f00ff 0%, #e100ff 100%);
          color: #fff;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 50px;
          font-weight: 600;
          box-shadow: 0 4px 15px rgba(225, 0, 255, 0.4);
          transition: all 0.3s ease;
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(225, 0, 255, 0.6);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Link Not Found</h1>
        <p>The shortened link you are trying to access does not exist in our system or might have been deleted.</p>
        <a href="/" class="btn">Go to Dashboard</a>
      </div>
    </body>
    </html>
  `);
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
