function emojiToCode(emoji) {
  if (!emoji) return null
  const chars = [...emoji]
  if (chars.length < 2) return null
  const code = chars.slice(0, 2).map(c => {
    const cp = c.codePointAt(0)
    return cp >= 0x1F1E6 && cp <= 0x1F1FF ? String.fromCharCode(cp - 0x1F1E6 + 65) : null
  }).join('').toLowerCase()
  return /^[a-z]{2}$/.test(code) ? code : null
}

export default function FlagIcon({ emoji, size = 18 }) {
  const code = emojiToCode(emoji)
  if (!code) return <span style={{ fontSize: size }}>🌐</span>
  return (
    <span
      className={`fi fi-${code}`}
      style={{ width: Math.round(size * 1.33), height: size, borderRadius: 2, display: 'inline-block', flexShrink: 0 }}
    />
  )
}
