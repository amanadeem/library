# Deployment Guide

## Local Development

```bash
npm install
npm start
# App runs on http://localhost:3000
```

## Deploy Backend on Render.com

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### Step 2: Create Render Service
1. Go to [render.com/dashboard](https://render.com/dashboard)
2. Click **New** > **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `wiselife-library-api` (or your choice)
   - **Runtime**: Node
   - **Build Command**: `npm install` (or auto-detected)
   - **Start Command**: `node server.js`
   - **Plan**: Free or paid (free tier restarts after 15 min inactivity)
5. Click **Create Web Service**

### Step 3: Wait for Deployment
- Render will automatically:
  - Install dependencies on Linux (SQLite3 rebuilt for Linux)
  - Run your app
  - Assign a public URL like `https://wiselife-library-api.onrender.com`

### Step 4: Configure Frontend to Use Backend

**On GitHub Pages demo** (or local Pages testing):
1. Open your Pages URL
2. Click **API Endpoint** button
3. Paste your Render backend URL:
   ```
   https://wiselife-library-api.onrender.com
   ```
4. Click OK

**For persistent storage during development**, you can:
- Keep using SQLite locally (fresh database on each Render restart on free tier)
- Upgrade to a paid plan to avoid restarts
- Later migrate to PostgreSQL for persistent multi-instance data

### Step 5: Test Backend
Once deployed, test with:
```bash
curl https://wiselife-library-api.onrender.com/api/health
```

Expected response:
```json
{"status":"ok","app":"wiselife-library","db":"connected"}
```

## Important Notes

### SQLite Limitations on Render
- **Free tier**: App restarts after 15 min inactivity → database resets
- **Solution**: Upgrade to paid tier OR migrate to PostgreSQL (recommended for production)

### For Production Stability
1. Use a paid Render instance
2. Or migrate to PostgreSQL:
   ```bash
   npm install pg
   # Update server.js to use PostgreSQL
   ```
3. Or use a containerized deployment (Docker)

### Database Backup Strategy
- Render free tier: No persistent storage
- Keep GitHub as source control only
- Export data regularly for backup

## Troubleshooting

### "Invalid ELF header" error
- This error occurs when native modules compiled on one OS are used on another
- **Fix**: Render rebuilds everything when you push changes
- Clear Render logs and redeploy:
  - Go to Render dashboard
  - Click service
  - Click **Manual Deploy** > **Newest Commit**

### App not starting
- Check Render logs: Dashboard > Service > Logs tab
- Verify `render.yaml` exists and is correct
- Ensure `package-lock.json` is in git

### API calls fail from GitHub Pages
- Verify backend URL in **API Endpoint** button is correct
- Check CORS: Backend must allow requests from your Pages domain
- Test with: `curl -i https://your-backend/api/health`
