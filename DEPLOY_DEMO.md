# Deploy Demo Trading Site

## Demo Site Created
Location: `/tmp/demo-trading-site/`

## Site Structure
```
demo-trading-site/
├── index.html      (Main landing page)
├── style.css       (Styling with gradient hero, cards, animations)
├── script.js       (Interactive features, smooth scroll, animations)
└── images/         (Empty folder for future assets)
```

## Features
- **Responsive Design**: Works on mobile, tablet, desktop
- **Sticky Navigation**: Fixed navbar with smooth scroll
- **Hero Section**: Gradient background with CTA button
- **Feature Cards**: 4 feature cards with hover effects
- **Pricing Section**: 3 pricing tiers with "Popular" badge
- **Animations**: Fade-in effects on scroll
- **Interactive**: Alert demo on CTA button click

## How to Deploy

### Step 1: Start the Server
```bash
cd ~/algocdk
go run main.go
```

### Step 2: Login as Admin
1. Open browser: `http://localhost:3000`
2. Login with admin credentials:
   - Email: `cdksavage7@gmail.com`
   - Password: (your admin password)

### Step 3: Navigate to Sites
1. Click on your profile/menu
2. Go to "Sites" or navigate to: `http://localhost:3000/sites`

### Step 4: Create New Site
1. Click "Create Site" button
2. Fill in the form:
   - **Site Name**: `AlgoTrader Pro Demo`
   - **URL Slug**: `algotrader-demo`
   - **Description**: `Professional trading platform landing page`
   - **Make site public**: ✓ (check this box)

### Step 5: Upload Folder
1. Click "Click to select website folder"
2. Navigate to `/tmp/demo-trading-site`
3. Select the entire folder (browser will show all files)
4. You should see: "3 files selected" (or 4 with images folder)

### Step 6: Submit
1. Click "Create Site"
2. Wait for success message
3. You'll see: "Site created successfully! Your site is now available at: /site/algotrader-demo"

### Step 7: View Your Site
Open in browser:
```
http://localhost:3000/site/algotrader-demo
```

## Expected Result
You should see:
- ✅ Professional landing page with gradient hero
- ✅ Sticky navigation bar
- ✅ 4 feature cards with icons
- ✅ 3 pricing tiers
- ✅ Smooth animations on scroll
- ✅ Working CTA button with alert
- ✅ Responsive design

## Security Check
The security scanner will verify:
- ✅ All files are allowed types (.html, .css, .js)
- ✅ No external scripts or iframes
- ✅ No dangerous patterns (eval, document.write)
- ✅ File sizes under limits
- ✅ Total size under 50MB

## Troubleshooting

**If upload fails:**
- Check file extensions are allowed
- Ensure total size < 50MB
- Verify no external CDN scripts
- Check browser console for errors

**If site doesn't load:**
- Verify slug is correct: `algotrader-demo`
- Check site status is "active"
- Ensure you're logged in as owner or site is public

**If styles don't load:**
- Check browser console for 404 errors
- Verify style.css and script.js are in same folder as index.html
- Check file paths are relative (not absolute)

## Test the Site
1. Click navigation links (smooth scroll)
2. Click "Start Free Trial" button (shows alert)
3. Hover over feature cards (lift animation)
4. Hover over pricing cards (border highlight)
5. Scroll down (fade-in animations)
6. Resize browser (responsive design)

## Share the Site
Once deployed, share the URL:
```
http://localhost:3000/site/algotrader-demo
```

Or if public, users can find it in:
```
http://localhost:3000/public-sites
```

Enjoy your deployed site! 🚀
