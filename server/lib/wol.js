import dgram from 'node:dgram'

export function normalizeMac(mac) {
  const m = String(mac || '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
  if (m.length !== 12) return null
  return m.match(/.{2}/g).join(':')
}

function buildMagicPacket(mac) {
  const bytes = mac.split(':').map((h) => parseInt(h, 16))
  const buf = Buffer.alloc(6 + 16 * 6, 0xff)
  for (let i = 0; i < 16; i++) Buffer.from(bytes).copy(buf, 6 + i * 6)
  return buf
}

function sendTo(packet, address, port) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.once('error', (err) => {
      socket.close()
      reject(err)
    })
    socket.bind(() => {
      socket.setBroadcast(true)
      socket.send(packet, 0, packet.length, port, address, (err) => {
        socket.close()
        err ? reject(err) : resolve()
      })
    })
  })
}

// マジックパケットを全体ブロードキャストと（分かれば）サブネット指向ブロードキャストへ送る
export async function sendWol(mac, { broadcast = null, port = 9 } = {}) {
  const norm = normalizeMac(mac)
  if (!norm) throw new Error('MACアドレスの形式が不正です')
  const packet = buildMagicPacket(norm)
  const targets = ['255.255.255.255']
  if (broadcast && !targets.includes(broadcast)) targets.push(broadcast)
  let lastErr = null
  let sent = 0
  for (const addr of targets) {
    try {
      await sendTo(packet, addr, port)
      sent++
    } catch (err) {
      lastErr = err
    }
  }
  if (sent === 0) throw lastErr || new Error('マジックパケットを送信できませんでした')
  return { mac: norm, targets, sent }
}
