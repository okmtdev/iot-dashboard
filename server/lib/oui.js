// 家庭でよく見かけるメーカーの OUI（MACアドレス先頭24bit）の抜粋。
// 完全な IEEE OUI データベースではないため、あくまで「推定」表示に使う。
const OUI_MAP = {
  // Raspberry Pi
  'b8:27:eb': 'Raspberry Pi',
  'dc:a6:32': 'Raspberry Pi',
  'e4:5f:01': 'Raspberry Pi',
  '28:cd:c1': 'Raspberry Pi',
  'd8:3a:dd': 'Raspberry Pi',
  '2c:cf:67': 'Raspberry Pi',
  // Espressif (ESP8266 / ESP32 系 IoT)
  '18:fe:34': 'Espressif (ESP)',
  '5c:cf:7f': 'Espressif (ESP)',
  'a0:20:a6': 'Espressif (ESP)',
  '24:0a:c4': 'Espressif (ESP)',
  '30:ae:a4': 'Espressif (ESP)',
  '24:6f:28': 'Espressif (ESP)',
  'a4:cf:12': 'Espressif (ESP)',
  '84:cc:a8': 'Espressif (ESP)',
  '3c:61:05': 'Espressif (ESP)',
  '40:f5:20': 'Espressif (ESP)',
  '8c:aa:b5': 'Espressif (ESP)',
  '48:3f:da': 'Espressif (ESP)',
  'bc:dd:c2': 'Espressif (ESP)',
  '84:f3:eb': 'Espressif (ESP)',
  // NAS
  '00:11:32': 'Synology',
  '24:5e:be': 'QNAP',
  // ネットワーク機器
  '50:c7:bf': 'TP-Link',
  '98:da:c4': 'TP-Link',
  'b0:be:76': 'TP-Link',
  '04:d9:f5': 'ASUS',
  '2c:fd:a1': 'ASUS',
  '70:4d:7b': 'ASUS',
  '10:6f:3f': 'Buffalo',
  '4c:e6:76': 'Buffalo',
  'cc:e1:d5': 'Buffalo',
  '00:24:a5': 'Buffalo',
  'bc:5c:4c': 'Elecom',
  '00:a0:de': 'Yamaha',
  '24:a4:3c': 'Ubiquiti',
  'f0:9f:c2': 'Ubiquiti',
  '74:ac:b9': 'Ubiquiti',
  '78:8a:20': 'Ubiquiti',
  '4c:5e:0c': 'MikroTik',
  '64:d1:54': 'MikroTik',
  'cc:2d:e0': 'MikroTik',
  // スマートホーム / スピーカー
  '00:17:88': 'Philips Hue',
  '54:ef:44': 'Aqara (Lumi)',
  'c4:4f:33': 'Tuya Smart',
  '00:0e:58': 'Sonos',
  '5c:aa:fd': 'Sonos',
  '94:9f:3e': 'Sonos',
  'f4:f5:d8': 'Google',
  '30:fd:38': 'Google',
  'fc:65:de': 'Amazon',
  '44:65:0d': 'Amazon',
  'f0:d2:f1': 'Amazon',
  '04:cf:8c': 'Xiaomi',
  '78:11:dc': 'Xiaomi',
  '64:09:80': 'Xiaomi',
  // ゲーム機
  '98:b6:e9': 'Nintendo',
  '04:03:d6': 'Nintendo',
  '7c:bb:8a': 'Nintendo',
  '00:d9:d1': 'Sony (PlayStation)',
  'bc:60:a7': 'Sony (PlayStation)',
  // カメラ
  '00:40:8c': 'Axis',
  'ec:71:db': 'Reolink (Baichuan)',
  // PC / 周辺機器
  'a8:20:66': 'Apple',
  'ac:bc:32': 'Apple',
  'f4:5c:89': 'Apple',
  'a4:bf:01': 'Intel (NUC等)',
  '30:05:5c': 'Brother',
  '00:26:ab': 'Seiko Epson',
  '00:1e:8f': 'Canon',
  '08:00:1f': 'Sharp',
  '00:80:f0': 'Panasonic',
  // 仮想化
  '52:54:00': 'QEMU/KVM 仮想マシン',
  '00:15:5d': 'Hyper-V 仮想マシン',
  '00:50:56': 'VMware 仮想マシン',
  '00:0c:29': 'VMware 仮想マシン',
  '08:00:27': 'VirtualBox 仮想マシン',
}

export function lookupVendor(mac) {
  const m = String(mac || '').toLowerCase()
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(m)) return { vendor: null, randomized: false }
  const prefix = m.slice(0, 8)
  if (m.startsWith('02:42:')) return { vendor: 'Docker コンテナ', randomized: true }
  const vendor = OUI_MAP[prefix] || null
  // 第1オクテットの下位2ビット目（ローカル管理ビット）が立っていればランダムMAC
  const randomized = (parseInt(m.slice(0, 2), 16) & 0x02) !== 0
  return { vendor, randomized: randomized && !vendor }
}
