import * as React from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useListScripts, useCreateScript, useDeleteScript, useToggleScript, getListScriptsQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "wouter"
import { Plus, MoreHorizontal, Trash2, Power, PowerOff, Code2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

const scriptSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  version: z.string().min(1, "Version is required").default("1.0.0"),
})

export function Scripts() {
  const { data: scripts, isLoading } = useListScripts()
  const createScript = useCreateScript()
  const deleteScript = useDeleteScript()
  const toggleScript = useToggleScript()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)

  const form = useForm<z.infer<typeof scriptSchema>>({
    resolver: zodResolver(scriptSchema),
    defaultValues: {
      name: "",
      description: "",
      version: "1.0.0",
    },
  })

  function onSubmit(values: z.infer<typeof scriptSchema>) {
    createScript.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Script created successfully" })
          setOpen(false)
          form.reset()
          queryClient.invalidateQueries({ queryKey: getListScriptsQueryKey() })
        },
        onError: (err) => {
          toast({ title: "Failed to create script", variant: "destructive" })
        }
      }
    )
  }

  function handleToggle(id: number, currentStatus: string) {
    toggleScript.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: `Script ${currentStatus === 'active' ? 'disabled' : 'enabled'}` })
          queryClient.invalidateQueries({ queryKey: getListScriptsQueryKey() })
        }
      }
    )
  }

  function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this script? This cannot be undone.")) return
    deleteScript.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Script deleted" })
          queryClient.invalidateQueries({ queryKey: getListScriptsQueryKey() })
        }
      }
    )
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scripts</h1>
          <p className="text-muted-foreground mt-1">Manage your software catalog.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Script
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Script</DialogTitle>
              <DialogDescription>
                Add a new script to your catalog. You can configure it further after creation.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Aimbot Pro" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initial Version</FormLabel>
                      <FormControl><Input placeholder="1.0.0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl><Input placeholder="Short description..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createScript.isPending}>
                    {createScript.isPending ? "Creating..." : "Create Script"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        {scripts?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Code2 className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">No scripts yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create your first script to start distributing.
            </p>
            <Button onClick={() => setOpen(true)} variant="outline">
              Create Script
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scripts?.map((script) => (
                <TableRow key={script.id}>
                  <TableCell className="font-medium">
                    <Link href={`/scripts/${script.id}`} className="hover:underline text-primary">
                      {script.name}
                    </Link>
                    {script.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                        {script.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{script.version}</TableCell>
                  <TableCell>
                    <Badge variant={script.status === 'active' ? 'success' : 'secondary'}>
                      {script.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(script.createdAt)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleToggle(script.id, script.status)}
                      title={script.status === 'active' ? 'Disable' : 'Enable'}
                    >
                      {script.status === 'active' ? <PowerOff className="h-4 w-4 text-muted-foreground" /> : <Power className="h-4 w-4 text-green-600" />}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(script.id)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
