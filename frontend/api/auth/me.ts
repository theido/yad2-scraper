import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const cookies = req.headers.cookie || ''
  const token = cookies
    .split(';')
    .find((c) => c.trim().startsWith('github_token='))
    ?.split('=')[1]

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  try {
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
      },
    })

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const user = await userResponse.json()

    // Verify user has access to the repository
    const repoOwner = process.env.GITHUB_REPO_OWNER
    const repoName = process.env.GITHUB_REPO_NAME

    if (repoOwner && repoName) {
      const repoResponse = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}`,
        {
          headers: {
            Authorization: `token ${token}`,
          },
        }
      )

      // User should at least be able to read the repo
      if (!repoResponse.ok) {
        return res.status(403).json({ error: 'No access to repository' })
      }
    }

    res.json(user)
  } catch (error) {
    console.error('Auth check error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

