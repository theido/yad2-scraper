import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/contexts/ProjectsContext'
import { ProjectList } from '@/components/ProjectList'
import { ProjectForm } from '@/components/ProjectForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, LogOut } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Project } from '@/types'

export default function Projects() {
  const { user, logout } = useAuth()
  const { projects, loading, addProject, updateProject } = useProjects()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<{ index: number; project: Project } | null>(null)

  const handleAdd = () => {
    setEditingProject(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (index: number, project: Project) => {
    setEditingProject({ index, project })
    setIsDialogOpen(true)
  }

  const handleClose = () => {
    setIsDialogOpen(false)
    setEditingProject(null)
  }

  const handleSave = async (project: Project) => {
    if (editingProject) {
      await updateProject(editingProject.index, project)
    } else {
      await addProject(project)
    }
    handleClose()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-3xl font-bold">Scraper Projects</CardTitle>
                <CardDescription className="mt-2">
                  Manage your Yad2 scraper configurations
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-medium">{user?.name || user?.login}</div>
                  <div className="text-xs text-muted-foreground">GitHub</div>
                </div>
                <Button variant="outline" size="sm" onClick={logout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-end mb-6">
              <Button onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add Project
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground">Loading projects...</div>
              </div>
            ) : (
              <ProjectList
                projects={projects}
                onEdit={handleEdit}
              />
            )}

            <Dialog open={isDialogOpen} onOpenChange={handleClose}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>
                    {editingProject ? 'Edit Project' : 'Add New Project'}
                  </DialogTitle>
                </DialogHeader>
                <ProjectForm
                  initialProject={editingProject?.project}
                  onSave={handleSave}
                  onCancel={handleClose}
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

