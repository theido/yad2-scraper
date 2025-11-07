import type { VercelRequest, VercelResponse } from '@vercel/node'

interface Project {
  topic: string
  url: string
  disabled: boolean
}

async function getGitHubToken(req: VercelRequest): Promise<string | null> {
  const cookies = req.headers.cookie || ''
  const token = cookies
    .split(';')
    .find((c) => c.trim().startsWith('github_token='))
    ?.split('=')[1]
  return token || null
}

async function getProjects(token: string): Promise<Project[]> {
  const repoOwner = process.env.GITHUB_REPO_OWNER
  const repoName = process.env.GITHUB_REPO_NAME

  if (!repoOwner || !repoName) {
    throw new Error('GitHub repository not configured')
  }

  // Get repository variable
  const response = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/actions/variables/SCRAPER_PROJECTS`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  )

  if (response.status === 404) {
    // Variable doesn't exist yet, return empty array
    return []
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`)
  }

  const data = await response.json()
  return JSON.parse(data.value || '[]')
}

async function updateProjects(token: string, projects: Project[]): Promise<void> {
  const repoOwner = process.env.GITHUB_REPO_OWNER
  const repoName = process.env.GITHUB_REPO_NAME

  if (!repoOwner || !repoName) {
    throw new Error('GitHub repository not configured')
  }

  // Check if variable exists
  let variableExists = false
  try {
    const checkResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/variables/SCRAPER_PROJECTS`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )
    variableExists = checkResponse.ok
  } catch (error) {
    // Variable doesn't exist, will create it
  }

  const value = JSON.stringify(projects)

  if (variableExists) {
    // Update existing variable
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/variables/SCRAPER_PROJECTS`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value }),
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to update projects: ${response.statusText}`)
    }
  } else {
    // Create new variable
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/variables`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'SCRAPER_PROJECTS',
          value,
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to create projects variable: ${response.statusText}`)
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = await getGitHubToken(req)

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  try {
    switch (req.method) {
      case 'GET': {
        const projects = await getProjects(token)
        return res.json({ projects })
      }

      case 'POST': {
        const newProject: Project = req.body
        const projects = await getProjects(token)
        projects.push(newProject)
        await updateProjects(token, projects)
        return res.json({ success: true })
      }

      case 'PUT': {
        const { index, project } = req.body
        const projects = await getProjects(token)
        if (index < 0 || index >= projects.length) {
          return res.status(400).json({ error: 'Invalid index' })
        }
        projects[index] = project
        await updateProjects(token, projects)
        return res.json({ success: true })
      }

      case 'DELETE': {
        const { index } = req.body
        const projects = await getProjects(token)
        if (index < 0 || index >= projects.length) {
          return res.status(400).json({ error: 'Invalid index' })
        }
        projects.splice(index, 1)
        await updateProjects(token, projects)
        return res.json({ success: true })
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch (error: any) {
    console.error('Projects API error:', error)
    return res.status(500).json({
      error: error.message || 'Internal server error',
    })
  }
}

