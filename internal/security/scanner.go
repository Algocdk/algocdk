package security

import (
	"bytes"
	"mime/multipart"
	"regexp"
	"strings"
)

var (
	allowedExtensions = map[string]bool{
		".html": true, ".htm": true, ".css": true, ".js": true,
		".json": true, ".txt": true, ".md": true,
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".svg": true, ".webp": true, ".ico": true,
		".woff": true, ".woff2": true, ".ttf": true, ".eot": true, ".otf": true,
		".mp4": true, ".webm": true, ".mp3": true, ".wav": true, ".ogg": true,
		".pdf": true, ".xml": true,
	}

	dangerousPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)<script[^>]*src\s*=\s*["']https?://`),
		regexp.MustCompile(`(?i)<iframe[^>]*src\s*=\s*["']https?://`),
		regexp.MustCompile(`(?i)eval\s*\(`),
		regexp.MustCompile(`(?i)document\.write\s*\(`),
		regexp.MustCompile(`(?i)\.innerHTML\s*=.*<script`),
		regexp.MustCompile(`(?i)javascript:\s*`),
		regexp.MustCompile(`(?i)data:text/html`),
		regexp.MustCompile(`(?i)<object[^>]*>`),
		regexp.MustCompile(`(?i)<embed[^>]*>`),
		regexp.MustCompile(`(?i)\.(exe|bat|cmd|sh|ps1|vbs|jar)$`),
	}
)

type ScanResult struct {
	Safe     bool
	Issues   []string
	Warnings []string
}

func ValidateFileExtension(filename string) bool {
	filename = strings.ToLower(filename)
	for ext := range allowedExtensions {
		if strings.HasSuffix(filename, ext) {
			return true
		}
	}
	return false
}

func ScanFile(file *multipart.FileHeader) *ScanResult {
	result := &ScanResult{Safe: true, Issues: []string{}, Warnings: []string{}}

	if !ValidateFileExtension(file.Filename) {
		result.Safe = false
		result.Issues = append(result.Issues, "Disallowed file type: "+file.Filename)
		return result
	}

	if file.Size > 10*1024*1024 {
		result.Safe = false
		result.Issues = append(result.Issues, "File too large: "+file.Filename)
		return result
	}

	ext := strings.ToLower(file.Filename)
	if !strings.HasSuffix(ext, ".html") && !strings.HasSuffix(ext, ".htm") &&
		!strings.HasSuffix(ext, ".css") && !strings.HasSuffix(ext, ".js") {
		return result
	}

	f, err := file.Open()
	if err != nil {
		result.Warnings = append(result.Warnings, "Could not scan: "+file.Filename)
		return result
	}
	defer f.Close()

	buf := new(bytes.Buffer)
	buf.ReadFrom(f)
	content := buf.String()

	for _, pattern := range dangerousPatterns {
		if pattern.MatchString(content) {
			result.Safe = false
			result.Issues = append(result.Issues, "Dangerous pattern in: "+file.Filename)
		}
	}

	return result
}

func ScanFiles(files []*multipart.FileHeader) *ScanResult {
	result := &ScanResult{Safe: true, Issues: []string{}, Warnings: []string{}}

	var totalSize int64
	for _, file := range files {
		totalSize += file.Size
	}
	if totalSize > 50*1024*1024 {
		result.Safe = false
		result.Issues = append(result.Issues, "Total upload exceeds 50MB")
		return result
	}

	for _, file := range files {
		fileResult := ScanFile(file)
		if !fileResult.Safe {
			result.Safe = false
		}
		result.Issues = append(result.Issues, fileResult.Issues...)
		result.Warnings = append(result.Warnings, fileResult.Warnings...)
	}

	return result
}
