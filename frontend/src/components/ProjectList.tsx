import { Project } from '@/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Edit2, Trash2, ExternalLink } from 'lucide-react'
import { useProjects } from '@/contexts/ProjectsContext'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useState } from 'react'

interface ProjectListProps {
  projects: Project[]
  onEdit: (index: number, project: Project) => void
}

export function ProjectList({ projects, onEdit }: ProjectListProps) {
  const { updateProject, deleteProject } = useProjects()
  const { toast } = useToast()
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; index: number; project: Project | null }>({
    open: false,
    index: -1,
    project: null,
  })

  const handleToggleDisabled = async (index: number, project: Project) => {
    try {
      await updateProject(index, {
        ...project,
        disabled: !project.disabled,
      })
    } catch (error) {
      // Error handling is done in the context
    }
  }

  const handleDeleteClick = (index: number, project: Project) => {
    setDeleteDialog({ open: true, index, project })
  }

  const handleDeleteConfirm = async () => {
    if (deleteDialog.index >= 0) {
      try {
        await deleteProject(deleteDialog.index)
        setDeleteDialog({ open: false, index: -1, project: null })
      } catch (error) {
        // Error handling is done in the context
      }
    }
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground mb-4">No projects yet</p>
          <p className="text-sm text-muted-foreground">
            Click "Add Project" to create your first scraper configuration
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {projects.map((project, index) => (
          <Card key={index} className={project.disabled ? 'opacity-60' : ''}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-xl mb-2">{project.topic}</CardTitle>
                  <CardDescription className="break-all">
                    <a
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      {project.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Label htmlFor={`switch-${index}`} className="text-sm">
                    {project.disabled ? 'Disabled' : 'Enabled'}
                  </Label>
                  <Switch
                    id={`switch-${index}`}
                    checked={!project.disabled}
                    onCheckedChange={() => handleToggleDisabled(index, project)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(index, project)}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteClick(index, project)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog.project?.topic}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, index: -1, project: null })}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

