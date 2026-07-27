import * as React from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { 
  useListKeys, 
  useGenerateKey, 
  useRevokeKey, 
  useDeleteKey, 
  useListScripts,
  getListKeysQueryKey 
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, KeyRound, Ban, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

const keySchema = z.object({
  scriptId: z.coerce.number().min(1, "Script is required"),
  whitelisted: z.boolean().default(false),
})

export function Keys() {
  const { data: keys, isLoading: keysLoading } = useListKeys()
  const { data: scripts, isLoading: scriptsLoading } = useListScripts()
  const generateKey = useGenerateKey()
  const revokeKey = useRevokeKey()
  const deleteKey = useDeleteKey()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)

  const form = useForm<z.infer<typeof keySchema>>({
    resolver: zodResolver(keySchema),
    defaultValues: {
      scriptId: 0,
      whitelisted: false,
    },
  })

  function onSubmit(values: z.infer<typeof keySchema>) {
    generateKey.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          toast({ title: "Key generated successfully", description: `Key: ${data.key}` })
          setOpen(false)
          form.reset()
          queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() })
        },
        onError: () => {
          toast({ title: "Failed to generate key", variant: "destructive" })
        }
      }
    )
  }

  function handleRevoke(id: number) {
    if (!confirm("Revoke this key? Users will lose access.")) return
    revokeKey.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Key revoked" })
          queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() })
        }
      }
    )
  }

  function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this key?")) return
    deleteKey.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Key deleted" })
          queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() })
        }
      }
    )
  }

  if (keysLoading || scriptsLoading) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">License Keys</h1>
          <p className="text-muted-foreground mt-1">Manage access tokens for your scripts.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Generate Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate License Key</DialogTitle>
              <DialogDescription>
                Create a new key to grant access to a specific script.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="scriptId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Script</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val)} value={String(field.value || "")}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a script" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {scripts?.map(s => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={generateKey.isPending}>
                    {generateKey.isPending ? "Generating..." : "Generate Key"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        {keys?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">No keys generated</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Generate keys to distribute your scripts.
            </p>
            <Button onClick={() => setOpen(true)} variant="outline">
              Generate Key
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Script</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys?.map((key) => {
                const script = scripts?.find(s => s.id === key.scriptId)
                return (
                  <TableRow key={key.id}>
                    <TableCell className="font-mono text-sm tracking-tight">{key.key}</TableCell>
                    <TableCell>
                      {script ? <span className="font-medium">{script.name}</span> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.status === 'active' ? 'success' : key.status === 'revoked' ? 'destructive' : 'secondary'}>
                        {key.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(key.createdAt)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {key.status === 'active' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRevoke(key.id)}
                          title="Revoke Key"
                        >
                          <Ban className="h-4 w-4 text-warning" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(key.id)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Delete Key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
