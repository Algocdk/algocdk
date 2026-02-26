# Site Folder Upload Guide

## Overview
Admins can now upload complete website folders instead of just code snippets. The platform will serve the entire site exactly as uploaded, including all HTML, CSS, JavaScript, images, and other assets.

## How It Works

### 1. Prepare Your Website Folder
Create a folder with your complete website structure:

```
my-website/
├── index.html          (required - main entry point)
├── style.css
├── script.js
├── images/
│   ├── logo.png
│   └── banner.jpg
├── css/
│   └── custom.css
├── js/
│   └── app.js
└── assets/
    └── fonts/
        └── custom.woff2
```

**Important**: Your folder MUST contain an `index.html` file as the main entry point.

### 2. Upload via Admin Dashboard

1. Navigate to `/sites` in your admin dashboard
2. Click "Create Site"
3. Fill in:
   - **Site Name**: Display name for your site
   - **URL Slug**: URL-friendly identifier (e.g., `my-awesome-site`)
   - **Description**: Brief description of your site
4. Click "Click to select website folder"
5. Select your entire website folder (browser will upload all files)
6. Check "Make site public" if you want it visible to all users
7. Click "Create Site"

### 3. Access Your Site

Your site will be available at:
```
https://yourdomain.com/site/your-slug
```

All assets are automatically served with correct paths:
- `/site/your-slug/` - Main page (index.html)
- `/site/your-slug/style.css` - CSS files
- `/site/your-slug/images/logo.png` - Images
- `/site/your-slug/js/app.js` - JavaScript files

## Example Site Structure

See `/tmp/example-site` for a complete working example:

**index.html**:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My Site</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Welcome!</h1>
    <img src="images/logo.png" alt="Logo">
    <script src="script.js"></script>
</body>
</html>
```

**Note**: Use relative paths in your HTML - the platform handles routing automatically.

## Features

✅ **Complete Folder Upload**: Upload entire website structure with subdirectories
✅ **Asset Serving**: All files (HTML, CSS, JS, images, fonts) served correctly
✅ **Path Security**: Prevents directory traversal attacks
✅ **View Tracking**: Automatically tracks site views
✅ **Public/Private**: Control site visibility
✅ **Owner Access**: Admins can always view their own sites

## Technical Details

### Backend Changes
- `CreateSiteHandler`: Now accepts multipart/form-data with file uploads
- `UpdateSiteHandler`: Supports updating site files
- `ServeSiteAsset`: New handler for serving static assets
- Path validation prevents security issues

### Frontend Changes
- Folder upload input with `webkitdirectory` attribute
- FormData submission instead of JSON
- Upload progress indication

### File Storage
Sites are stored in:
```
./sites/user_{user_id}/{slug}/
```

### Database
The `sites` table stores:
- `html_content`: Path to index.html
- `slug`: URL identifier
- `owner_id`: Admin user ID
- `is_public`: Visibility flag
- `view_count`: Number of views

## Browser Compatibility

Folder upload is supported in:
- Chrome/Edge (webkitdirectory)
- Firefox (directory attribute)
- Safari 11.1+

## Limitations

- Maximum file size depends on server configuration
- Binary files (images, fonts) are supported
- No server-side processing (PHP, Python, etc.)
- Static sites only

## Security

✅ Path validation prevents directory traversal
✅ Owner-only access for private sites
✅ Files stored in isolated directories per user
✅ No execution of server-side code

## Example Usage

1. Create a simple HTML site locally
2. Test it in your browser
3. Upload the entire folder via admin dashboard
4. Share the `/site/your-slug` URL

Your site will be served exactly as you created it!
