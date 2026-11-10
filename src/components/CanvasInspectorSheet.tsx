import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/client/workspace-context";
import { DynamicUISpecRenderer } from "./dynamic-ui/ComponentRegistry";

export function CanvasInspectorSheet() {
  const { canvasSpec, setCanvasSpec } = useWorkspace();
  if (!canvasSpec) return null;

  return (
    <Dialog open={Boolean(canvasSpec)} onOpenChange={(open) => !open && setCanvasSpec(null)}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{canvasSpec.title}</DialogTitle>
        </DialogHeader>
        <DynamicUISpecRenderer
          spec={canvasSpec.spec}
          events={canvasSpec.events}
          allowPopOut={false}
        />
      </DialogContent>
    </Dialog>
  );
}

