import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code, state } = req.query

  if (!code || !state) {
    return res.redirect('/login?error=invalid_request')
  }

  // Verify state matches
  const cookies = req.headers.cookie || ''
  const sessionState = cookies
    .split(';')
    .find((c) => c.trim().startsWith('oauth_state='))
    ?.split('=')[1]
  if (!sessionState || sessionState !== state) {
    return res.redirect('/login?error=state_mismatch')
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      return res.redirect('/login?error=token_exchange_failed')
    }

    // Get user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      return res.redirect('/login?error=user_fetch_failed')
    }

    const user = await userResponse.json()

    // Store token in httpOnly cookie
    res.setHeader('Set-Cookie', [
      `github_token=${tokenData.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`,
      `oauth_state=; HttpOnly; Path=/; Max-Age=0`,
    ])

    // Redirect to home
    res.redirect('/')
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.redirect('/login?error=server_error')
  }
}

