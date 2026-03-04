# Deriv Contract Types - Quick Reference

## Rise/Fall (CALL/PUT)

**What it does**: Predicts if the final price will be higher or lower than the entry price

**API Parameters**:
```javascript
{
  contract_type: 'CALL' or 'PUT',
  duration: 10,
  duration_unit: 't', // ticks, 's', 'm', 'h', 'd'
  // NO barrier parameter
}
```

**UI**: Shows duration selector, hides barrier input

**Example**: "I predict the price will RISE in the next 10 ticks"

---

## Higher/Lower (CALLE/PUTE)

**What it does**: Predicts if the final price will be above or below a specific barrier price

**API Parameters**:
```javascript
{
  contract_type: 'CALLE' or 'PUTE',
  barrier: '3896.50', // absolute price
  // NO duration or duration_unit
}
```

**UI**: Shows barrier input, hides duration selector

**Example**: "I predict the price will go HIGHER than 3896.50"

---

## Key Differences

| Feature | Rise/Fall | Higher/Lower |
|---------|-----------|--------------|
| Uses Duration | ✅ Yes | ❌ No |
| Uses Barrier | ❌ No | ✅ Yes |
| Barrier Format | N/A | Absolute price |
| Expiry | After duration | When price touches barrier |
| Contract Types | CALL, PUT | CALLE, PUTE |

---

## Common Mistakes

❌ **Wrong**: Sending both duration AND barrier for CALLE/PUTE
```javascript
{
  contract_type: 'CALLE',
  duration: 5,        // ❌ Don't include this
  duration_unit: 't', // ❌ Don't include this
  barrier: '3896.50'
}
```

✅ **Correct**: Barrier only for CALLE/PUTE
```javascript
{
  contract_type: 'CALLE',
  barrier: '3896.50'  // ✅ Only barrier
}
```

✅ **Correct**: Duration only for CALL/PUT
```javascript
{
  contract_type: 'CALL',
  duration: 10,       // ✅ Only duration
  duration_unit: 't'
}
```
