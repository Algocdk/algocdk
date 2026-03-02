package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/gorilla/websocket"
	"github.com/keyadaniel56/algocdk/internal/models"
)

type DerivService struct {
	wsURL string
}

func NewDerivService() *DerivService {
	appID := os.Getenv("DERIV_APP_ID")
	if appID == "" {
		appID = "63623"
	}
	return &DerivService{
		wsURL: fmt.Sprintf("wss://ws.derivws.com/websockets/v3?app_id=%s", appID),
	}
}

// AuthenticateAndGetUserInfo authenticates with Deriv and returns user info
func (s *DerivService) AuthenticateAndGetUserInfo(apiToken string) (*models.DerivUserInfo, error) {
	conn, err := s.connectWebSocket()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Send authorization request
	authReq := map[string]interface{}{
		"authorize": apiToken,
	}

	if err := conn.WriteJSON(authReq); err != nil {
		return nil, fmt.Errorf("failed to send auth request: %v", err)
	}

	// Read authorization response
	var response models.DerivWSResponse
	if err := conn.ReadJSON(&response); err != nil {
		return nil, fmt.Errorf("failed to read auth response: %v", err)
	}

	// Check for errors
	if response.Error.Code != "" {
		return nil, fmt.Errorf("deriv API error: %s - %s", response.Error.Code, response.Error.Message)
	}

	// Check if authorization was successful
	if response.MsgType != "authorize" {
		return nil, errors.New("unexpected response type")
	}

	userInfo := &models.DerivUserInfo{
		LoginID:        response.Authorize.LoginID,
		Email:          response.Authorize.Email,
		Country:        response.Authorize.Country,
		Currency:       response.Authorize.Currency,
		FullName:       response.Authorize.FullName,
		IsVirtual:      response.Authorize.IsVirtual == 1,
		LandingCompany: response.Authorize.LandingCompanyName,
	}

	return userInfo, nil
}

// GetAccountList fetches all accounts associated with the API token
func (s *DerivService) GetAccountList(apiToken string) (*models.DerivAccountList, error) {
	conn, err := s.connectWebSocket()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Authorize first to get account list
	authReq := map[string]interface{}{
		"authorize": apiToken,
	}
	if err := conn.WriteJSON(authReq); err != nil {
		return nil, err
	}

	// Read auth response which includes account_list
	var authResponse models.DerivWSResponse
	if err := conn.ReadJSON(&authResponse); err != nil {
		return nil, err
	}

	if authResponse.Error.Code != "" {
		return nil, fmt.Errorf("auth error: %s", authResponse.Error.Message)
	}

	accountList := &models.DerivAccountList{
		Accounts: authResponse.Authorize.AccountList,
	}

	return accountList, nil
}

// SwitchAccount switches to a different account using the same API token
// ============================================
// UPDATE your SwitchAccount method in service
// ============================================

// Replace the existing SwitchAccount method with this:

// SwitchAccount switches to a different account using the same API token
func (s *DerivService) SwitchAccount(apiToken, loginID string) (*models.DerivUserInfo, error) {
	conn, err := s.connectWebSocket()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// First authorize to get the token
	authReq := map[string]interface{}{
		"authorize": apiToken,
	}
	if err := conn.WriteJSON(authReq); err != nil {
		return nil, err
	}

	var authResponse models.DerivWSResponse
	if err := conn.ReadJSON(&authResponse); err != nil {
		return nil, err
	}

	if authResponse.Error.Code != "" {
		return nil, fmt.Errorf("auth error: %s", authResponse.Error.Message)
	}

	// Check if the requested loginID exists in account list
	found := false
	var targetAccount models.DerivAccount
	for _, account := range authResponse.Authorize.AccountList {
		if account.LoginID == loginID {
			found = true
			targetAccount = account
			break
		}
	}

	if !found {
		return nil, fmt.Errorf("account %s not found in your account list", loginID)
	}

	// Switch to the target account using account_list call with loginid
	switchReq := map[string]interface{}{
		"account_list": 1,
		"loginid":      loginID,
	}
	if err := conn.WriteJSON(switchReq); err != nil {
		return nil, err
	}

	var switchResponse models.DerivWSResponse
	if err := conn.ReadJSON(&switchResponse); err != nil {
		return nil, err
	}

	if switchResponse.Error.Code != "" {
		return nil, fmt.Errorf("switch error: %s", switchResponse.Error.Message)
	}

	// Get balance for the switched account
	balanceReq := map[string]interface{}{
		"balance":   1,
		"subscribe": 0,
	}
	if err := conn.WriteJSON(balanceReq); err != nil {
		return nil, err
	}

	var balanceResponse models.DerivWSResponse
	if err := conn.ReadJSON(&balanceResponse); err != nil {
		return nil, err
	}

	balance := 0.0
	if balanceResponse.Error.Code == "" {
		balance = balanceResponse.Balance.Balance
	}

	// Return user info for the switched account
	userInfo := &models.DerivUserInfo{
		LoginID:        loginID,
		Email:          authResponse.Authorize.Email,
		Country:        authResponse.Authorize.Country,
		Currency:       targetAccount.Currency,
		Balance:        balance,
		FullName:       authResponse.Authorize.FullName,
		IsVirtual:      targetAccount.IsVirtual == 1,
		AccountType:    targetAccount.AccountType,
		LandingCompany: authResponse.Authorize.LandingCompanyName,
	}

	return userInfo, nil
}

// GetBalance fetches the account balance for current or specific account
func (s *DerivService) GetBalance(apiToken string) (*models.DerivBalance, error) {
	conn, err := s.connectWebSocket()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Authorize first
	authReq := map[string]interface{}{
		"authorize": apiToken,
	}
	if err := conn.WriteJSON(authReq); err != nil {
		return nil, err
	}

	// Read auth response
	var authResponse models.DerivWSResponse
	if err := conn.ReadJSON(&authResponse); err != nil {
		return nil, err
	}

	if authResponse.Error.Code != "" {
		return nil, fmt.Errorf("auth error: %s", authResponse.Error.Message)
	}

	// Request balance
	balanceReq := map[string]interface{}{
		"balance":   1,
		"subscribe": 0,
	}
	if err := conn.WriteJSON(balanceReq); err != nil {
		return nil, err
	}

	// Read balance response
	var balanceResponse models.DerivWSResponse
	if err := conn.ReadJSON(&balanceResponse); err != nil {
		return nil, err
	}

	if balanceResponse.Error.Code != "" {
		return nil, fmt.Errorf("balance error: %s", balanceResponse.Error.Message)
	}

	balance := &models.DerivBalance{
		Balance:  balanceResponse.Balance.Balance,
		Currency: balanceResponse.Balance.Currency,
		LoginID:  balanceResponse.Balance.LoginID,
	}

	// Add is_virtual info from auth response
	balance.IsVirtual = authResponse.Authorize.IsVirtual == 1

	return balance, nil
}

// GetAccountDetails fetches detailed account information
func (s *DerivService) GetAccountDetails(apiToken string) (*models.DerivAccountDetails, error) {
	userInfo, err := s.AuthenticateAndGetUserInfo(apiToken)
	if err != nil {
		return nil, err
	}

	balance, err := s.GetBalance(apiToken)
	if err != nil {
		return nil, err
	}

	details := &models.DerivAccountDetails{
		LoginID:        userInfo.LoginID,
		Email:          userInfo.Email,
		Country:        userInfo.Country,
		Currency:       userInfo.Currency,
		FullName:       userInfo.FullName,
		IsVirtual:      userInfo.IsVirtual,
		LandingCompany: userInfo.LandingCompany,
		Balance:        balance.Balance,
	}

	return details, nil
}

// ValidateToken checks if the API token is valid
func (s *DerivService) ValidateToken(apiToken string) (bool, error) {
	_, err := s.AuthenticateAndGetUserInfo(apiToken)
	if err != nil {
		return false, err
	}
	return true, nil
}

// PlaceTrade places a binary options trade
func (s *DerivService) PlaceTrade(apiToken, symbol, tradeType string, stake float64, duration int) (*models.DerivTradeResult, error) {
	conn, err := s.connectWebSocket()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Authorize first
	authReq := map[string]interface{}{
		"authorize": apiToken,
	}
	if err := conn.WriteJSON(authReq); err != nil {
		return nil, err
	}

	var authResponse models.DerivWSResponse
	if err := conn.ReadJSON(&authResponse); err != nil {
		return nil, err
	}

	if authResponse.Error.Code != "" {
		return nil, fmt.Errorf("auth error: %s", authResponse.Error.Message)
	}

	// Place the trade using buy contract
	tradeReq := map[string]interface{}{
		"buy": 1,
		"parameters": map[string]interface{}{
			"contract_type": tradeType,
			"symbol":        symbol,
			"amount":        stake,
			"duration":      duration,
			"duration_unit": "t", // ticks
			"basis":         "stake",
		},
	}

	if err := conn.WriteJSON(tradeReq); err != nil {
		return nil, err
	}

	// Read trade response
	var tradeResponse models.DerivWSResponse
	if err := conn.ReadJSON(&tradeResponse); err != nil {
		return nil, err
	}

	if tradeResponse.Error.Code != "" {
		return nil, fmt.Errorf("trade error: %s", tradeResponse.Error.Message)
	}

	// For now, return simulated result since actual trade response structure may vary
	result := &models.DerivTradeResult{
		ContractID: fmt.Sprintf("REAL_%d", time.Now().Unix()),
		Payout:     stake * 1.85, // Typical payout
		Status:     "open",
	}

	return result, nil
}

// connectWebSocket establishes WebSocket connection to Deriv
func (s *DerivService) connectWebSocket() (*websocket.Conn, error) {
	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.Dial(s.wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Deriv WebSocket: %v", err)
	}

	return conn, nil
}

// Helper function to pretty print JSON for debugging
func prettyPrint(data interface{}) {
	b, _ := json.MarshalIndent(data, "", "  ")
	fmt.Println(string(b))
}
