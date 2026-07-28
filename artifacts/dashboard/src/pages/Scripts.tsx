import * as React from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useListScripts,
  useCreateScript,
  useDeleteScript,
  useToggleScript,
  getListScriptsQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Link } from "wouter"
import { Plus, Trash2, Power, PowerOff, Code2, Upload, FileCode } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
  content: z.string().optional(),
})

export function Scripts() {
  const { data: scripts, isLoading } = useListScripts()
  const createScript = useCreateScript()
  const deleteScript = useDeleteScript()
  const toggleScript = useToggleScript()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  const form = useForm<z.infer<typeof scriptSchema>>({
    resolver: zodResolver(scriptSchema),
    defaultValues: { name: "", description: "", version: "1.0.0", content: "" },
  })

  function loadFile(file: File) {
    if (!file.name.endsWith(".lua") && !file.name.endsWith(".txt")) {
      toast({ title: "Please upload a .lua or .txt file", variant: "destructive" })
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      form.setValue("content", text)
      // Auto-fill name from filename if empty
      if (!form.getValues("name")) {
        form.setValue("name", file.name.replace(/\.(lua|txt)$/, ""))
      }
      toast({ title: `Loaded ${file.name}` })
    }
    reader.readAsText(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
    e.target.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  function onSubmit(values: z.infer<typeof scriptSchema>) {
    createScript.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Script created — code obfuscated automatically ✓" })
          setOpen(false)
          form.reset()
          queryClient.invalidateQueries({ queryKey: getListScriptsQueryKey() })
        },
        onError: () => toast({ title: "Failed to create script", variant: "destructive" }),
      }
    )
  }

  function handleToggle(id: number, status: string) {
    toggleScript.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: `Script ${status === "active" ? "disabled" : "enabled"}` })
          queryClient.invalidateQueries({ queryKey: getListScriptsQueryKey() })
        },
      }
    )
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this script? This cannot be undone.")) return
    deleteScript.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Script deleted" })
          queryClient.invalidateQueries({ queryKey: getListScriptsQueryKey() })
        },
      }
    )
  }

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scripts</h1>
          <p className="text-muted-foreground mt-1">Manage your Lua script catalog.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Script</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Upload Script</DialogTitle>
              <DialogDescription>
                Upload a <code className="text-primary">.lua</code> file or paste your code. It will be <strong>automatically obfuscated</strong> before saving.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                {/* File drop zone */}
                <div
                  className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".lua,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <FileCode className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop a .lua file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Auto-fills the code field below</p>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Script Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Speed Hub v2" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="version"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Version</FormLabel>
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
                        <FormLabel>Description <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                        <FormControl><Input placeholder="Short description" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        Lua Code
                        <Badge variant="outline" className="text-xs font-normal">auto-obfuscated on save</Badge>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={`-- Paste your Lua script here\nprint("Hello from LuaBox!")`}
                          className="font-mono text-xs min-h-[180px] resize-y"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" disabled={createScript.isPending}>
                    {createScript.isPending
                      ? <><Upload className="mr-2 h-4 w-4 animate-pulse" /> Obfuscating…</>
                      : <><Upload className="mr-2 h-4 w-4" /> Upload & Obfuscate</>}
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
              Upload your first Lua script to get started.
            </p>
            <Button onClick={() => setOpen(true)} variant="outline">Upload Script</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[90px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scripts?.map((script) => (
                <TableRow key={script.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground select-all">{script.id}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/scripts/${script.id}`} className="hover:underline text-primary">
                      {script.name}
                    </Link>
                    {script.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[260px]">{script.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{script.version}</TableCell>
                  <TableCell>
                    {script.obfuscatedContent
                      ? <Badge variant="outline" className="text-green-400 border-green-400/30">obfuscated</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={script.status === "active" ? "success" : "secondary"}>
                      {script.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(script.createdAt)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => handleToggle(script.id, script.status)}
                      title={script.status === "active" ? "Disable" : "Enable"}
                    >
                      {script.status === "active"
                        ? <PowerOff className="h-4 w-4 text-muted-foreground" />
                        : <Power className="h-4 w-4 text-green-500" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon"
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
