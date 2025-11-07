import { useState, useEffect } from 'react'
import { Project } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface ProjectFormProps {
  initialProject?: Project
  onSave: (project: Project) => Promise<void>
  onCancel: () => void
}

export function ProjectForm({ initialProject, onSave, onCancel }: ProjectFormProps) {
  const [topic, setTopic] = useState('')
  const [url, setUrl] = useState('')
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialProject) {
      setTopic(initialProject.topic)
      setUrl(initialProject.url)
      setDisabled(initialProject.disabled)
    }
  }, [initialProject])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!topic.trim()) {
      alert('Topic is required')
      return
    }

    if (!url.trim()) {
      alert('URL is required')
      return
    }

    try {
      setLoading(true)
      await onSave({
        topic: topic.trim(),
        url: url.trim(),
        disabled,
      })
    } catch (error) {
      // Error handling is done in the context
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="topic">Topic</Label>
        <Input
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g., סורנטו, אקספלורר"
          required
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          A name to identify this scraper project
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="url">Yad2 URL</Label>
        <Input
          id="url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.yad2.co.il/vehicles/cars?..."
          required
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          The full Yad2 search URL to scrape
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="disabled"
          checked={disabled}
          onCheckedChange={setDisabled}
          disabled={loading}
        />
        <Label htmlFor="disabled" className="cursor-pointer">
          Disabled
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Disabled projects will be skipped by the scraper
      </p>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : initialProject ? 'Update' : 'Add'}
        </Button>
      </div>
    </form>
  )
}

