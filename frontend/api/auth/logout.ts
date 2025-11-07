import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Set-Cookie', [
    'github_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  ])

  res.json({ success: true })
}

