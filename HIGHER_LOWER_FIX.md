# Higher/Lower Trading Fix

## Problem
Users were getting "Trading is not offered for this duration" error when placing Higher/Lower (CALLE/PUTE) trades.

## Root Cause

**Critical Discovery**: Deriv API requires **either** barrier **or** duration for contracts, NOT both:
- **Rise/Fall (CALL/PUT)**: Uses duration, NO barrier
- **Higher/Lower (CALLE/PUTE)**: Uses barrier (absolute price), NO duration

The original code was sending both barrier AND duration for Higher/Lower contracts, causing the API to reject the trade.

## Solution

### 1. Separate Contract Logic
```javascript
if (type === 'CALLE') {
  // Higher/Lower: barrier only, NO duration
  proposal.barrier = barrierPrice.toFixed(2);
} else {
  // Rise/Fall: duration only, NO barrier
  proposal.duration = duration;
  proposal.duration_unit = unit;
}
```

### 2. UI Changes
- **Rise/Fall**: Shows duration selector, hides barrier input
- **Higher/Lower**: Shows barrier input, hides duration selector
- Duration section now has `id="durationSection"` for easy show/hide

### 3. Barrier Format
- Uses **absolute price** (e.g., "3896.50"), not relative offset
- Defaults to 0.1% above current price
- User can adjust or click "Current" button

## How It Works Now

### Rise/Fall (CALL/PUT)
- Shows: Duration input with unit selector (ticks/seconds/minutes/hours/days)
- Hides: Barrier input
- API call: Includes `duration` and `duration_unit`, NO `barrier`
- Predicts if last tick is higher/lower than entry price

### Higher/Lower (CALLE/PUTE)
- Shows: Barrier price input
- Hides: Duration selector
- API call: Includes `barrier` (absolute price), NO `duration` or `duration_unit`
- Predicts if last tick is above/below the barrier price
- Contract expires when price touches the barrier

## Testing

### Rise/Fall
1. Select "Rise/Fall" from contract type
2. Duration section visible, barrier hidden
3. Set duration (e.g., 10 ticks)
4. Click Rise or Fall
5. ✅ Trade executes successfully

### Higher/Lower
1. Select "Higher/Lower" from contract type
2. Barrier section visible, duration hidden
3. Barrier auto-set to current price + 0.1%
4. Adjust barrier if needed
5. Click Higher or Lower
6. ✅ Trade executes successfully

## Technical Details

### Deriv API Contract Rules
- **CALL/PUT**: Requires `duration` + `duration_unit`, barrier is optional
- **CALLE/PUTE**: Requires `barrier` (absolute price), duration is NOT used
- Barrier format: Absolute price as string (e.g., "3896.50")
- Contract expires when price reaches barrier (for CALLE/PUTE)

### Why This Fix Works
1. Removes duration from Higher/Lower proposals (was causing "not offered for this duration" error)
2. Uses absolute barrier price (simpler and correct format)
3. Separates UI based on contract type (clearer for users)
4. Follows Deriv API documentation exactly

## Files Modified
- `/home/danikeya/algocdk/frontend/updown.html`
  - `placeTrade()`: Conditional logic for barrier vs duration
  - `updateContractType()`: Show/hide duration vs barrier sections
  - `validateDuration()`: Only updates calculations for Rise/Fall
  - HTML: Added `id="durationSection"` wrapper
  - Help text: Updated to explain the difference
