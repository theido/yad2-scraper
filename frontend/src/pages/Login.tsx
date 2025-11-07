import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { GitHub } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">Yad2 Scraper</CardTitle>
          <CardDescription className="text-lg mt-2">
            Config Manager
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground">
            Sign in with GitHub to manage your scraper projects
          </p>
          <Button
            onClick={login}
            className="w-full"
            size="lg"
          >
            <GitHub className="mr-2 h-5 w-5" />
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

