package handlers

import (
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

var screenShareUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type ScreenShareHub struct {
	sessions map[uint]*SessionRoom
	mu       sync.RWMutex
}

type SessionRoom struct {
	sessionID  uint
	adminConn  *websocket.Conn
	adminMutex sync.Mutex
	viewers    map[uint]*ViewerConn
	mu         sync.RWMutex
}

type ViewerConn struct {
	conn  *websocket.Conn
	mutex sync.Mutex
}

type WSMessage struct {
	Type      string      `json:"type"`
	SessionID uint        `json:"session_id,omitempty"`
	UserID    uint        `json:"user_id,omitempty"`
	Username  string      `json:"username,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Message   string      `json:"message,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

var hub = &ScreenShareHub{
	sessions: make(map[uint]*SessionRoom),
}

func init() {
	go cleanupStaleSessions()
}

func cleanupStaleSessions() {
	for {
		time.Sleep(2 * time.Minute)
		if database.DB != nil {
			database.DB.Model(&models.ScreenShareSession{}).
				Where("is_active = ? AND updated_at < ?", true, time.Now().Add(-5*time.Minute)).
				Update("is_active", false)
		}
	}
}

// StartScreenShareSession - Admin starts a screen sharing session
func StartScreenShareSession(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Check if user is admin or superadmin (case-insensitive)
	role := user.Role
	if role != "admin" && role != "Admin" && role != "superadmin" && role != "SuperAdmin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only admins can start screen sharing"})
		return
	}

	session := models.ScreenShareSession{
		AdminID:   user.ID,
		AdminName: user.Name,
		IsActive:  true,
		StartedAt: time.Now(),
	}

	if err := database.DB.Create(&session).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	hub.mu.Lock()
	hub.sessions[session.ID] = &SessionRoom{
		sessionID: session.ID,
		viewers:   make(map[uint]*ViewerConn),
	}
	hub.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"message": "Screen sharing session started",
		"session": session,
	})
}

// StopScreenShareSession - Admin stops the session
func StopScreenShareSession(c *gin.Context) {
	sessionID, _ := strconv.Atoi(c.Param("id"))
	userID, _ := c.Get("user_id")

	var session models.ScreenShareSession
	if err := database.DB.First(&session, sessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	if session.AdminID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only session admin can stop it"})
		return
	}

	now := time.Now()
	session.IsActive = false
	session.EndedAt = &now
	database.DB.Save(&session)

	// Close all connections
	hub.mu.Lock()
	if room, exists := hub.sessions[uint(sessionID)]; exists {
		room.mu.Lock()
		if room.adminConn != nil {
			room.adminConn.Close()
		}
		for _, conn := range room.viewers {
			go func(viewerConn *ViewerConn) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("WebSocket write panic recovered: %v", r)
					}
					viewerConn.conn.Close()
				}()
				viewerConn.mutex.Lock()
				viewerConn.conn.WriteJSON(WSMessage{Type: "session_ended", Message: "Admin ended the session", Timestamp: time.Now()})
				viewerConn.mutex.Unlock()
			}(conn)
		}
		room.mu.Unlock()
		delete(hub.sessions, uint(sessionID))
	}
	hub.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{"message": "Session stopped"})
}

// GetActiveSessions - Get all active sessions
func GetActiveSessions(c *gin.Context) {
	var sessions []models.ScreenShareSession
	database.DB.Where("is_active = ?", true).Find(&sessions)

	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

// GetSessionParticipants - Get participants in a session
func GetSessionParticipants(c *gin.Context) {
	sessionID := c.Param("id")

	var participants []models.ScreenShareParticipant
	database.DB.Where("session_id = ? AND is_active = ?", sessionID, true).Find(&participants)

	c.JSON(http.StatusOK, gin.H{"participants": participants})
}

// ScreenShareWebSocket - WebSocket handler for screen sharing
func ScreenShareWebSocket(c *gin.Context) {
	sessionID, _ := strconv.Atoi(c.Query("session_id"))
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var user models.User
	database.DB.First(&user, userID)

	conn, err := screenShareUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	role := user.Role
	isAdmin := role == "admin" || role == "Admin" || role == "superadmin" || role == "SuperAdmin"

	hub.mu.Lock()
	room, exists := hub.sessions[uint(sessionID)]
	if !exists {
		// Check if session exists in DB and recreate room
		var session models.ScreenShareSession
		if err := database.DB.Where("id = ? AND is_active = ?", sessionID, true).First(&session).Error; err == nil {
			// Session exists in DB, recreate room
			room = &SessionRoom{
				sessionID: uint(sessionID),
				viewers:   make(map[uint]*ViewerConn),
			}
			hub.sessions[uint(sessionID)] = room
			exists = true
		}
	}
	hub.mu.Unlock()

	if !exists {
		conn.WriteJSON(WSMessage{Type: "error", Message: "Session not found"})
		conn.Close()
		return
	}

	room.mu.Lock()
	if isAdmin {
		// Replace admin connection (allow reconnection)
		if room.adminConn != nil {
			// Close old connection if exists
			oldConn := room.adminConn
			go func() {
				oldConn.Close()
			}()
		}
		room.adminConn = conn
		// Notify admin they're connected
		room.adminMutex.Lock()
		conn.WriteJSON(WSMessage{
			Type:      "admin_connected",
			Message:   "You are now streaming",
			Timestamp: time.Now(),
		})
		room.adminMutex.Unlock()

		// Notify admin of existing viewers
		for userID := range room.viewers {
			var user models.User
			if err := database.DB.First(&user, userID).Error; err == nil {
				room.adminMutex.Lock()
				conn.WriteJSON(WSMessage{
					Type:      "user_joined",
					UserID:    user.ID,
					Username:  user.Name,
					Timestamp: time.Now(),
				})
				room.adminMutex.Unlock()
			}
		}
	} else {
		room.viewers[user.ID] = &ViewerConn{conn: conn}

		// Record participant
		participant := models.ScreenShareParticipant{
			SessionID: uint(sessionID),
			UserID:    user.ID,
			Username:  user.Name,
			JoinedAt:  time.Now(),
			IsActive:  true,
		}
		database.DB.Create(&participant)

		// Notify admin of new viewer
		if room.adminConn != nil {
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("WebSocket write panic recovered: %v", r)
					}
				}()
				room.adminMutex.Lock()
				room.adminConn.WriteJSON(WSMessage{
					Type:      "user_joined",
					UserID:    user.ID,
					Username:  user.Name,
					Timestamp: time.Now(),
				})
				room.adminMutex.Unlock()
			}()
		}
	}
	room.mu.Unlock()

	defer func() {
		room.mu.Lock()
		if isAdmin {
			// Don't clear admin connection immediately, allow reconnection
			// Only clear if connection is the current one
			if room.adminConn == conn {
				room.adminConn = nil
			}
		} else {
			delete(room.viewers, user.ID)

			// Update participant
			database.DB.Model(&models.ScreenShareParticipant{}).
				Where("session_id = ? AND user_id = ? AND is_active = ?", sessionID, user.ID, true).
				Updates(map[string]interface{}{"is_active": false, "left_at": time.Now()})

			// Notify admin
			if room.adminConn != nil {
				go func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("WebSocket write panic recovered: %v", r)
						}
					}()
					room.adminMutex.Lock()
					room.adminConn.WriteJSON(WSMessage{
						Type:      "user_left",
						UserID:    user.ID,
						Username:  user.Name,
						Timestamp: time.Now(),
					})
					room.adminMutex.Unlock()
				}()
			}
		}
		room.mu.Unlock()
		conn.Close()
	}()

	for {
		var msg WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			break
		}

		msg.UserID = user.ID
		msg.Username = user.Name
		msg.Timestamp = time.Now()

		room.mu.RLock()
		switch msg.Type {
		case "screen_data":
			// Admin sends screen data to all viewers
			if isAdmin {
				for _, viewerConn := range room.viewers {
					go func(vc *ViewerConn) {
						defer func() {
							if r := recover(); r != nil {
								log.Printf("WebSocket write panic recovered: %v", r)
							}
						}()
						vc.mutex.Lock()
						vc.conn.WriteJSON(msg)
						vc.mutex.Unlock()
					}(viewerConn)
				}
			}
		case "audio_data":
			// Broadcast audio to all participants
			if isAdmin {
				// Admin audio to all viewers
				for _, viewerConn := range room.viewers {
					go func(vc *ViewerConn) {
						defer func() {
							if r := recover(); r != nil {
								log.Printf("WebSocket write panic recovered: %v", r)
							}
						}()
						vc.mutex.Lock()
						vc.conn.WriteJSON(msg)
						vc.mutex.Unlock()
					}(viewerConn)
				}
			} else {
				log.Printf("Viewer %s sending audio to admin and other viewers", user.Name)
				// Viewer audio to admin and other viewers
				if room.adminConn != nil {
					go func() {
						defer func() {
							if r := recover(); r != nil {
								log.Printf("WebSocket write panic recovered: %v", r)
							}
						}()
						room.adminMutex.Lock()
						room.adminConn.WriteJSON(msg)
						room.adminMutex.Unlock()
					}()
				} else {
					log.Printf("Admin connection is nil, cannot send audio")
				}
				for viewerID, viewerConn := range room.viewers {
					if viewerID != user.ID {
						go func(vc *ViewerConn) {
							defer func() {
								if r := recover(); r != nil {
									log.Printf("WebSocket write panic recovered: %v", r)
								}
							}()
							vc.mutex.Lock()
							vc.conn.WriteJSON(msg)
							vc.mutex.Unlock()
						}(viewerConn)
					}
				}
			}
		case "chat":
			// Save chat message
			chatMsg := models.ScreenShareMessage{
				SessionID: uint(sessionID),
				UserID:    user.ID,
				Username:  user.Name,
				Message:   msg.Message,
			}
			database.DB.Create(&chatMsg)

			// Broadcast to all
			if room.adminConn != nil {
				go func() {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("WebSocket write panic recovered: %v", r)
						}
					}()
					room.adminMutex.Lock()
					room.adminConn.WriteJSON(msg)
					room.adminMutex.Unlock()
				}()
			}
			for _, viewerConn := range room.viewers {
				go func(vc *ViewerConn) {
					defer func() {
						if r := recover(); r != nil {
							log.Printf("WebSocket write panic recovered: %v", r)
						}
					}()
					vc.mutex.Lock()
					vc.conn.WriteJSON(msg)
					vc.mutex.Unlock()
				}(viewerConn)
			}
		}
		room.mu.RUnlock()
	}
}

// GetSessionMessages - Get chat messages for a session
func GetSessionMessages(c *gin.Context) {
	sessionID := c.Param("id")

	var messages []models.ScreenShareMessage
	database.DB.Where("session_id = ?", sessionID).Order("created_at asc").Find(&messages)

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// RequestJoinSession - User requests to join a session
func RequestJoinSession(c *gin.Context) {
	sessionID, _ := strconv.Atoi(c.Param("id"))
	userID, _ := c.Get("user_id")

	var user models.User
	database.DB.First(&user, userID)

	// Check if user is the session admin
	var session models.ScreenShareSession
	if err := database.DB.First(&session, sessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	if session.AdminID == user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You cannot join your own session"})
		return
	}

	// Check if already has approved request
	var approvedRequest models.ScreenShareJoinRequest
	if err := database.DB.Where("session_id = ? AND user_id = ? AND status = ?", sessionID, user.ID, "approved").First(&approvedRequest).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{
			"message":       "Already approved",
			"request":       approvedRequest,
			"auto_approved": true,
		})
		return
	}

	// Check if already requested
	var existing models.ScreenShareJoinRequest
	if err := database.DB.Where("session_id = ? AND user_id = ? AND status = ?", sessionID, user.ID, "pending").First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{"message": "Request already pending"})
		return
	}

	request := models.ScreenShareJoinRequest{
		SessionID: uint(sessionID),
		UserID:    user.ID,
		Username:  user.Name,
		Status:    "pending",
	}
	database.DB.Create(&request)

	// Notify admin via WebSocket
	hub.mu.RLock()
	if room, exists := hub.sessions[uint(sessionID)]; exists {
		room.mu.RLock()
		if room.adminConn != nil {
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("WebSocket write panic recovered: %v", r)
					}
				}()
				room.adminMutex.Lock()
				room.adminConn.WriteJSON(WSMessage{
					Type:      "join_request",
					UserID:    user.ID,
					Username:  user.Name,
					Data:      request.ID,
					Timestamp: time.Now(),
				})
				room.adminMutex.Unlock()
			}()
		}
		room.mu.RUnlock()
	}
	hub.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{"message": "Join request sent", "request": request})
}

// GetJoinRequests - Admin gets pending join requests
func GetJoinRequests(c *gin.Context) {
	sessionID := c.Param("id")

	var requests []models.ScreenShareJoinRequest
	database.DB.Where("session_id = ? AND status = ?", sessionID, "pending").Find(&requests)

	c.JSON(http.StatusOK, gin.H{"requests": requests})
}

// ReviewJoinRequest - Admin approves/rejects join request
func ReviewJoinRequest(c *gin.Context) {
	requestID, _ := strconv.Atoi(c.Param("request_id"))

	var input struct {
		Status string `json:"status"` // approved or rejected
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	var request models.ScreenShareJoinRequest
	if err := database.DB.First(&request, requestID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
		return
	}

	request.Status = input.Status
	database.DB.Save(&request)

	// Notify the requesting user about the decision
	hub.mu.RLock()
	if room, exists := hub.sessions[request.SessionID]; exists {
		room.mu.RLock()
		// Find the user's connection in viewers
		if viewerConn, found := room.viewers[request.UserID]; found {
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("WebSocket write panic recovered: %v", r)
					}
				}()
				viewerConn.mutex.Lock()
				viewerConn.conn.WriteJSON(WSMessage{
					Type:      "join_response",
					Data:      input.Status,
					Message:   input.Status,
					Timestamp: time.Now(),
				})
				viewerConn.mutex.Unlock()
			}()
		}
		// Also notify admin about the review completion
		if room.adminConn != nil {
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("WebSocket write panic recovered: %v", r)
					}
				}()
				room.adminMutex.Lock()
				room.adminConn.WriteJSON(WSMessage{
					Type:      "request_reviewed",
					UserID:    request.UserID,
					Username:  request.Username,
					Data:      input.Status,
					Message:   "Request " + input.Status,
					Timestamp: time.Now(),
				})
				room.adminMutex.Unlock()
			}()
		}
		room.mu.RUnlock()
	}
	hub.mu.RUnlock()

	c.JSON(http.StatusOK, gin.H{"message": "Request reviewed", "request": request})
}
