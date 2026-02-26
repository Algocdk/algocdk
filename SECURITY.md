# Site Upload Security

## Security Measures Implemented

### 1. File Type Validation
**Allowed Extensions:**
- Web: `.html`, `.htm`, `.css`, `.js`, `.json`, `.xml`
- Images: `.jpg`, `.jpeg`, `.png`, `.gif`, `.svg`, `.webp`, `.ico`
- Fonts: `.woff`, `.woff2`, `.ttf`, `.eot`, `.otf`
- Media: `.mp4`, `.webm`, `.mp3`, `.wav`, `.ogg`
- Documents: `.pdf`, `.txt`, `.md`

**Blocked:** `.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, `.vbs`, `.jar`, and all other executables

### 2. File Size Limits
- **Per File:** 10MB maximum
- **Total Upload:** 50MB maximum

### 3. Content Scanning
Scans HTML, CSS, and JS files for:

**Dangerous Patterns:**
- External script sources (CDN scripts blocked)
- External iframes
- `eval()` function calls
- `document.write()` calls
- `innerHTML` with script injection
- Event handlers with scripts
- `javascript:` protocol
- `data:text/html` URIs
- `<object>` and `<embed>` tags
- Executable file references

### 4. Path Security
- Directory traversal prevention
- Files isolated per user: `./sites/user_{id}/{slug}/`
- Path validation on asset serving

### 5. Sandboxing
- Static files only (no server-side execution)
- No PHP, Python, Ruby, or other server-side languages
- Files served with appropriate MIME types

## What Gets Blocked

❌ External scripts from CDNs
❌ Cryptocurrency miners
❌ Keyloggers or malware
❌ Executable files
❌ Server-side scripts
❌ Cross-site scripting (XSS) attempts
❌ Iframe injections
❌ Code obfuscation with eval()

## What's Allowed

✅ Local JavaScript files
✅ CSS stylesheets
✅ Images and media
✅ Web fonts
✅ Static HTML content
✅ JSON data files
✅ PDF documents

## Error Messages

When security scan fails:
```json
{
  "error": "Security scan failed",
  "issues": [
    "Dangerous pattern in: script.js",
    "Disallowed file type: malware.exe"
  ]
}
```

## Best Practices

1. **Test Locally First:** Ensure your site works before uploading
2. **Use Relative Paths:** Link assets with relative paths
3. **Avoid External Resources:** Host all assets locally
4. **No Inline Scripts:** Keep JavaScript in separate files for easier scanning
5. **Clean Code:** Avoid obfuscation or minification that looks suspicious

## Technical Implementation

**Scanner Location:** `/internal/security/scanner.go`

**Integration Points:**
- `CreateSiteHandler`: Scans all files before saving
- `UpdateSiteHandler`: Scans new files on update

**Scan Process:**
1. Validate file extensions
2. Check file sizes
3. Read text file contents
4. Apply regex pattern matching
5. Return safe/unsafe result with details

## Limitations

- Cannot detect all sophisticated attacks
- Relies on pattern matching
- May have false positives
- Binary files not deeply inspected

## Future Enhancements

- Virus scanning integration (ClamAV)
- AI-based malware detection
- Sandboxed execution environment
- Content Security Policy (CSP) headers
- Automated security audits
