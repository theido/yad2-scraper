import type { Handler } from '@netlify/functions'

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  const { code, state } = event.queryStringParameters || {}

  if (!code || !state) {
    return {
      statusCode: 302,
      headers: {
        Location: '/login?error=invalid_request',
      },
    }
  }

  // Verify state matches
  const sessionState = event.headers.cookie
    ?.split(';')
    .find((c) => c.trim().startsWith('oauth_state='))
    ?.split('=')[1]

  if (!sessionState || sessionState !== state) {
    return {
      statusCode: 302,
      headers: {
        Location: '/login?error=state_mismatch',
      },
    }
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
      return {
        statusCode: 302,
        headers: {
          Location: '/login?error=token_exchange_failed',
        },
      }
    }

    // Get user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      return {
        statusCode: 302,
        headers: {
          Location: '/login?error=user_fetch_failed',
        },
      }
    }

    // Redirect to home with cookie set
    return {
      statusCode: 302,
      headers: {
        Location: '/',
        'Set-Cookie': [
          `github_token=${tokenData.access_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`,
          `oauth_state=; HttpOnly; Path=/; Max-Age=0`,
        ].join(', '),
      },
    }
  } catch (error) {
    console.error('OAuth callback error:', error)
    return {
      statusCode: 302,
      headers: {
        Location: '/login?error=server_error',
      },
    }
  }
}

