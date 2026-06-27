"use client";

import type { AgendaItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";

interface AgendaFormProps {
  items: AgendaItem[];
  onChange: (items: AgendaItem[]) => void;
}

export function AgendaForm({ items, onChange }: AgendaFormProps) {
  function addItem() {
    onChange([...items, { title: "", duration: 300 }]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof AgendaItem, value: string | number) {
    onChange(
      items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Agenda</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="mr-1 h-3 w-3" /> Add Item
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="mt-2.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-medium text-primary">
              {i + 1}
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex gap-3">
                <Input
                  value={item.title}
                  onChange={(e) => updateItem(i, "title", e.target.value)}
                  placeholder="Item title"
                  className="flex-1"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    value={item.duration / 60}
                    onChange={(e) =>
                      updateItem(i, "duration", (parseInt(e.target.value, 10) || 0) * 60)
                    }
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>
              <Input
                value={item.assignee_email ?? ""}
                onChange={(e) => updateItem(i, "assignee_email", e.target.value)}
                placeholder="Assignee email (optional)"
                type="email"
                className="text-sm"
              />
            </div>
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1"
                onClick={() => removeItem(i)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        <Separator />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium">
            {Math.round(items.reduce((s, a) => s + a.duration, 0) / 60)} min
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
