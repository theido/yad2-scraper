import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Project } from '@/types'
import { useToast } from '@/components/ui/use-toast'

interface ProjectsContextType {
  projects: Project[]
  loading: boolean
  addProject: (project: Project) => Promise<void>
  updateProject: (index: number, project: Project) => Promise<void>
  deleteProject: (index: number) => Promise<void>
  refreshProjects: () => Promise<void>
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/projects')
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects || [])
      } else {
        throw new Error('Failed to fetch projects')
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
      toast({
        title: 'Error',
        description: 'Failed to load projects',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const addProject = async (project: Project) => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to add project')
      }

      await fetchProjects()
      toast({
        title: 'Success',
        description: 'Project added successfully',
      })
    } catch (error: any) {
      console.error('Error adding project:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to add project',
        variant: 'destructive',
      })
      throw error
    }
  }

  const updateProject = async (index: number, project: Project) => {
    try {
      const response = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index, project }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to update project')
      }

      await fetchProjects()
      toast({
        title: 'Success',
        description: 'Project updated successfully',
      })
    } catch (error: any) {
      console.error('Error updating project:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to update project',
        variant: 'destructive',
      })
      throw error
    }
  }

  const deleteProject = async (index: number) => {
    try {
      const response = await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to delete project')
      }

      await fetchProjects()
      toast({
        title: 'Success',
        description: 'Project deleted successfully',
      })
    } catch (error: any) {
      console.error('Error deleting project:', error)
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete project',
        variant: 'destructive',
      })
      throw error
    }
  }

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        loading,
        addProject,
        updateProject,
        deleteProject,
        refreshProjects: fetchProjects,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects() {
  const context = useContext(ProjectsContext)
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectsProvider')
  }
  return context
}

