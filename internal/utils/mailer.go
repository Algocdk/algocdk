package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
)

func SendResetEmail(to, resetLink string) {
	plain := fmt.Sprintf("Click the link to reset your password:\n%s\n\nThis link expires in 15 minutes.", resetLink)
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D1421;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#0D1421;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1f2e;border-radius:16px;border:1px solid #2d3748;overflow:hidden;max-width:560px;width:100%%;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#FF4500,#E63900);padding:32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">Algo<span style="opacity:0.85;">cdk</span></h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Automated Trading Platform</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px 36px;">
          <h2 style="margin:0 0 12px;color:#e2e8f0;font-size:22px;font-weight:700;">Reset Your Password</h2>
          <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong style="color:#e2e8f0;">15 minutes</strong>.</p>
          <table cellpadding="0" cellspacing="0" width="100%%"><tr><td align="center" style="padding:8px 0 32px;">
            <a href="%s" style="display:inline-block;background:linear-gradient(135deg,#FF4500,#E63900);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">Reset Password</a>
          </td></tr></table>
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;">Or copy this link into your browser:</p>
          <p style="margin:0;background:#0D1421;border:1px solid #2d3748;border-radius:8px;padding:12px;color:#94a3b8;font-size:12px;word-break:break-all;">%s</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 36px;border-top:1px solid #2d3748;text-align:center;">
          <p style="margin:0;color:#475569;font-size:12px;">If you didn't request a password reset, you can safely ignore this email.</p>
          <p style="margin:8px 0 0;color:#334155;font-size:11px;">© 2026 Algocdk. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, resetLink, resetLink)
	sendEmail(to, "Reset Your Algocdk Password", plain, html, "RESET EMAIL")
}

func SendVerificationEmail(to, verificationLink string) {
	plain := fmt.Sprintf("Welcome to Algocdk!\n\nPlease verify your email:\n%s\n\nIf you didn't create an account, ignore this email.", verificationLink)
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D1421;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background:#0D1421;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1f2e;border-radius:16px;border:1px solid #2d3748;overflow:hidden;max-width:560px;width:100%%;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#FF4500,#E63900);padding:32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">Algo<span style="opacity:0.85;">cdk</span></h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Automated Trading Platform</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px 36px;">
          <h2 style="margin:0 0 12px;color:#e2e8f0;font-size:22px;font-weight:700;">Verify Your Email Address</h2>
          <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6;">Welcome to Algocdk! You're one step away from accessing automated trading bots and real-time market analysis. Click the button below to verify your email.</p>
          <table cellpadding="0" cellspacing="0" width="100%%"><tr><td align="center" style="padding:8px 0 32px;">
            <a href="%s" style="display:inline-block;background:linear-gradient(135deg,#FF4500,#E63900);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">Verify Email Address</a>
          </td></tr></table>
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;">Or copy this link into your browser:</p>
          <p style="margin:0;background:#0D1421;border:1px solid #2d3748;border-radius:8px;padding:12px;color:#94a3b8;font-size:12px;word-break:break-all;">%s</p>
        </td></tr>
        <!-- What's next -->
        <tr><td style="padding:0 36px 32px;">
          <table width="100%%" cellpadding="0" cellspacing="0" style="background:#0D1421;border:1px solid #2d3748;border-radius:12px;padding:20px;">
            <tr><td>
              <p style="margin:0 0 16px;color:#e2e8f0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">What you get access to</p>
              <!-- Item 1 -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td width="28" valign="top">
                    <div style="width:20px;height:20px;background:rgba(255,69,0,0.15);border-radius:5px;text-align:center;line-height:20px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-top:4px;">
                        <rect x="3" y="8" width="18" height="13" rx="2" stroke="#FF4500" stroke-width="2"/>
                        <path d="M8 8V6a4 4 0 018 0v2" stroke="#FF4500" stroke-width="2"/>
                        <circle cx="9" cy="14" r="1.5" fill="#FF4500"/>
                        <circle cx="15" cy="14" r="1.5" fill="#FF4500"/>
                        <path d="M9 18h6" stroke="#FF4500" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                    </div>
                  </td>
                  <td style="padding-left:10px;color:#94a3b8;font-size:13px;line-height:1.5;">Automated trading bots with proven strategies</td>
                </tr>
              </table>
              <!-- Item 2 -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td width="28" valign="top">
                    <div style="width:20px;height:20px;background:rgba(255,69,0,0.15);border-radius:5px;text-align:center;line-height:20px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-top:4px;">
                        <path d="M3 17l4-4 4 4 4-6 4 3" stroke="#FF4500" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M3 21h18" stroke="#FF4500" stroke-width="2" stroke-linecap="round"/>
                      </svg>
                    </div>
                  </td>
                  <td style="padding-left:10px;color:#94a3b8;font-size:13px;line-height:1.5;">Real-time market analysis and digit statistics</td>
                </tr>
              </table>
              <!-- Item 3 -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td width="28" valign="top">
                    <div style="width:20px;height:20px;background:rgba(255,69,0,0.15);border-radius:5px;text-align:center;line-height:20px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-top:4px;">
                        <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" stroke="#FF4500" stroke-width="2" stroke-linejoin="round" fill="none"/>
                      </svg>
                    </div>
                  </td>
                  <td style="padding-left:10px;color:#94a3b8;font-size:13px;line-height:1.5;">Digits, barriers, multipliers &amp; accumulator trading</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 36px;border-top:1px solid #2d3748;text-align:center;">
          <p style="margin:0;color:#475569;font-size:12px;">If you didn't create an Algocdk account, you can safely ignore this email.</p>
          <p style="margin:8px 0 0;color:#334155;font-size:11px;">© 2026 Algocdk. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, verificationLink, verificationLink)
	sendEmail(to, "Verify Your Algocdk Account", plain, html, "VERIFICATION EMAIL")
}

func sendEmail(to, subject, plainMsg, htmlMsg, emailType string) {
	mode := os.Getenv("EMAIL_MODE")
	from := os.Getenv("EMAIL_FROM")

	switch mode {
	case "console":
		log.Printf("===== %s =====", emailType)
		log.Println("To:", to)
		log.Println("Message:", plainMsg)
		log.Println("=======================")

	case "resend":
		sendViaResend(to, subject, htmlMsg, emailType)

	case "brevo":
		sendViaBrevo(to, subject, htmlMsg, emailType)

	case "sendgrid":
		sendViaSendGrid(to, subject, htmlMsg, emailType)

	case "smtp":
		host := os.Getenv("EMAIL_HOST")
		port := os.Getenv("EMAIL_PORT")
		username := os.Getenv("EMAIL_USERNAME")
		password := os.Getenv("EMAIL_PASSWORD")
		log.Printf("SMTP ATTEMPT (%s): host=%s port=%s user=%s from=%s to=%s", emailType, host, port, username, from, to)
		auth := smtp.PlainAuth("", username, password, host)
		err := smtp.SendMail(host+":"+port, auth, from, []string{to}, []byte(plainMsg))
		if err != nil {
			log.Printf("SMTP ERROR (%s): %v", emailType, err)
		} else {
			log.Printf("SMTP SUCCESS (%s): sent to %s", emailType, to)
		}

	default:
		log.Printf("EMAIL_MODE=%q — %s not sent. Set EMAIL_MODE=resend or smtp.", mode, emailType)
	}
}

func sendViaResend(to, subject, html, emailType string) {
	apiKey := os.Getenv("RESEND_API_KEY")
	from := os.Getenv("EMAIL_FROM")
	if from == "" {
		from = "onboarding@resend.dev"
	}

	payload := map[string]interface{}{
		"from":    from,
		"to":      []string{to},
		"subject": subject,
		"html":    html,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("RESEND ERROR (%s): failed to create request: %v", emailType, err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("RESEND ERROR (%s): %v", emailType, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("RESEND SUCCESS (%s): sent to %s", emailType, to)
	} else {
		log.Printf("RESEND ERROR (%s): status %d", emailType, resp.StatusCode)
	}
}

func sendViaBrevo(to, subject, html, emailType string) {
	apiKey := os.Getenv("BREVO_API_KEY")
	from := os.Getenv("EMAIL_FROM")
	fromName := os.Getenv("EMAIL_FROM_NAME")
	if fromName == "" {
		fromName = "Algocdk"
	}

	payload := map[string]interface{}{
		"sender":      map[string]string{"name": fromName, "email": from},
		"to":          []map[string]string{{"email": to}},
		"subject":     subject,
		"htmlContent": html,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://api.brevo.com/v3/smtp/email", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("BREVO ERROR (%s): failed to create request: %v", emailType, err)
		return
	}
	req.Header.Set("api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("BREVO ERROR (%s): %v", emailType, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("BREVO SUCCESS (%s): sent to %s", emailType, to)
	} else {
		log.Printf("BREVO ERROR (%s): status %d", emailType, resp.StatusCode)
	}
}

func sendViaSendGrid(to, subject, html, emailType string) {
	apiKey := os.Getenv("SENDGRID_API_KEY")
	from := os.Getenv("EMAIL_FROM")
	fromName := os.Getenv("EMAIL_FROM_NAME")
	if fromName == "" {
		fromName = "Algocdk"
	}

	payload := map[string]interface{}{
		"personalizations": []map[string]interface{}{
			{"to": []map[string]string{{"email": to}}},
		},
		"from":    map[string]string{"email": from, "name": fromName},
		"subject": subject,
		"content": []map[string]string{
			{"type": "text/html", "value": html},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://api.sendgrid.com/v3/mail/send", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("SENDGRID ERROR (%s): failed to create request: %v", emailType, err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("SENDGRID ERROR (%s): %v", emailType, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("SENDGRID SUCCESS (%s): sent to %s", emailType, to)
	} else {
		log.Printf("SENDGRID ERROR (%s): status %d", emailType, resp.StatusCode)
	}
}
