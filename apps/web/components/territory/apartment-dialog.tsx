"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Icon } from "@/components/icons/icon";
import {
  useClusters,
  useCreateApartment,
  useCreateApartmentContact,
  useDeleteApartmentContact,
  useUpdateApartment,
} from "@/lib/api/hooks";
import type { Apartment, ApartmentContact } from "@/lib/api/types";

const CONTACT_KIND_LABEL: Record<ApartmentContact["kind"], string> = {
  WATCHMAN: "Watchman",
  MANAGER: "Property manager",
  RWA: "RWA",
};

export function ApartmentDialog({
  apartment,
  open,
  onOpenChange,
}: {
  /** null = create a new apartment */
  apartment: Apartment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!apartment;
  const clustersQuery = useClusters();
  const clusters = clustersQuery.data?.results ?? [];

  const [cluster, setCluster] = useState(apartment?.cluster ?? "");
  const [name, setName] = useState(apartment?.name ?? "");
  const [address, setAddress] = useState(apartment?.address ?? "");
  const [pincode, setPincode] = useState(apartment?.pincode ?? "");
  const [gateNotes, setGateNotes] = useState(apartment?.gate_notes ?? "");
  const [launchedOn, setLaunchedOn] = useState(apartment?.launched_on ?? "");

  const createApartment = useCreateApartment();
  const updateApartment = useUpdateApartment();
  const saving = createApartment.isPending || updateApartment.isPending;

  useEffect(() => {
    if (open) {
      setCluster(apartment?.cluster ?? clusters[0]?.id ?? "");
      setName(apartment?.name ?? "");
      setAddress(apartment?.address ?? "");
      setPincode(apartment?.pincode ?? "");
      setGateNotes(apartment?.gate_notes ?? "");
      setLaunchedOn(apartment?.launched_on ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apartment]);

  function handleSave() {
    const patch = {
      cluster,
      name: name.trim(),
      address: address.trim(),
      pincode: pincode.trim(),
      gate_notes: gateNotes.trim(),
      launched_on: launchedOn || null,
    };
    if (isEdit) {
      updateApartment.mutate(
        { id: apartment.id, patch },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createApartment.mutate(patch, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? apartment.name : "New apartment"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="apt-name">Name</Label>
              <Input id="apt-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cluster</Label>
              <Select value={cluster} onValueChange={setCluster}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a cluster" />
                </SelectTrigger>
                <SelectContent>
                  {clusters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apt-pincode">Pincode</Label>
              <Input
                id="apt-pincode"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="apt-address">Address</Label>
              <Input
                id="apt-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="apt-gate-notes">Gate notes</Label>
              <Input
                id="apt-gate-notes"
                placeholder="How the rider gets in — visitor pass, security desk…"
                value={gateNotes}
                onChange={(e) => setGateNotes(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apt-launched">Launched on</Label>
              <Input
                id="apt-launched"
                type="date"
                value={launchedOn ?? ""}
                onChange={(e) => setLaunchedOn(e.target.value)}
              />
            </div>
            {isEdit && (
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() =>
                    updateApartment.mutate({
                      id: apartment.id,
                      patch: { is_active: !apartment.is_active },
                    })
                  }
                >
                  {apartment.is_active ? (
                    <>
                      <Badge variant="success" dot>
                        Active
                      </Badge>{" "}
                      — click to deactivate
                    </>
                  ) : (
                    <>
                      <Badge variant="neutral" dot>
                        Inactive
                      </Badge>{" "}
                      — click to activate
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {isEdit && (
            <>
              <Separator />
              <ContactsSection apartment={apartment} />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!name.trim() || !cluster} onClick={handleSave}>
            {isEdit ? "Save" : "Create apartment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactsSection({ apartment }: { apartment: Apartment }) {
  const createContact = useCreateApartmentContact(apartment.id);
  const deleteContact = useDeleteApartmentContact(apartment.id);
  const [kind, setKind] = useState<ApartmentContact["kind"]>("WATCHMAN");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");

  function handleAdd() {
    if (!contactName.trim()) return;
    createContact.mutate(
      { apartment: apartment.id, kind, name: contactName.trim(), phone: phone.trim() },
      {
        onSuccess: () => {
          setContactName("");
          setPhone("");
        },
      }
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Contacts</Label>
      {apartment.contacts.length === 0 ? (
        <p className="text-sm text-text-muted">No contacts on file yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {apartment.contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{CONTACT_KIND_LABEL[c.kind]}</Badge>
                <span className="text-text-primary">{c.name}</span>
                {c.phone && <span className="text-text-muted">{c.phone}</span>}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={deleteContact.isPending}
                onClick={() => deleteContact.mutate(c.id)}
              >
                <Icon name="close" className="size-3.5" label={`Remove ${c.name}`} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as ApartmentContact["kind"])}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CONTACT_KIND_LABEL) as ApartmentContact["kind"][]).map((k) => (
              <SelectItem key={k} value={k}>
                {CONTACT_KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="flex-1"
        />
        <Input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-32"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={createContact.isPending}
          disabled={!contactName.trim()}
          onClick={handleAdd}
        >
          <Icon name="plus" label="Add contact" />
        </Button>
      </div>
    </div>
  );
}
