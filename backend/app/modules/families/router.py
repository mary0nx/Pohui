from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import DB, Ctx, CurrentUser
from app.integrations.storage import delete_files_quietly
from app.modules.families import service
from app.modules.families.schemas import (
    FamilyCreate,
    FamilyDelete,
    FamilyOut,
    FamilyPatch,
    InvitationCreate,
    InvitationCreated,
    InvitationOut,
    InvitationPreview,
    InvitationTokenIn,
    MemberOut,
    MemberPatch,
)
from app.security.access import load_family_context

router = APIRouter(tags=["families"])


@router.post("/families", response_model=FamilyOut, status_code=201)
async def create_family(body: FamilyCreate, user: CurrentUser, db: DB) -> FamilyOut:
    family = await service.create_family(db, user, body)
    await db.commit()
    ctx = await load_family_context(db, user, family.id)
    return await service.family_out(db, ctx)


@router.get("/families/{family_id}", response_model=FamilyOut)
async def get_family(ctx: Ctx, db: DB) -> FamilyOut:
    return await service.family_out(db, ctx)


@router.patch("/families/{family_id}", response_model=FamilyOut)
async def patch_family(body: FamilyPatch, ctx: Ctx, db: DB) -> FamilyOut:
    await service.update_family(db, ctx, body)
    await db.commit()
    return await service.family_out(db, ctx)


@router.post("/families/{family_id}/delete", status_code=204)
async def delete_family(body: FamilyDelete, ctx: Ctx, db: DB) -> None:
    keys = await service.delete_family(db, ctx, body.confirm_name)
    await db.commit()
    await delete_files_quietly(keys)


@router.get("/families/{family_id}/members", response_model=list[MemberOut])
async def members(ctx: Ctx, db: DB) -> list[MemberOut]:
    return await service.list_members(db, ctx.family_id)


@router.patch("/families/{family_id}/members/{member_id}", response_model=list[MemberOut])
async def patch_member(
    member_id: uuid.UUID, body: MemberPatch, ctx: Ctx, db: DB
) -> list[MemberOut]:
    await service.change_role(db, ctx, member_id, body.role)
    await db.commit()
    return await service.list_members(db, ctx.family_id)


@router.delete("/families/{family_id}/members/{member_id}", status_code=204)
async def remove_member(member_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    keys = await service.remove_member(db, ctx, member_id)
    await db.commit()
    await delete_files_quietly(keys)


@router.post("/families/{family_id}/leave", status_code=204)
async def leave(ctx: Ctx, db: DB) -> None:
    keys = await service.leave_family(db, ctx)
    await db.commit()
    await delete_files_quietly(keys)


@router.post("/families/{family_id}/invitations", response_model=InvitationCreated, status_code=201)
async def create_invitation(body: InvitationCreate, ctx: Ctx, db: DB) -> InvitationCreated:
    out = await service.create_invitation(db, ctx, body)
    await db.commit()
    return out


@router.get("/families/{family_id}/invitations", response_model=list[InvitationOut])
async def list_invitations(ctx: Ctx, db: DB) -> list[InvitationOut]:
    return [InvitationOut.model_validate(i) for i in await service.list_invitations(db, ctx)]


@router.delete("/families/{family_id}/invitations/{invitation_id}", status_code=204)
async def revoke_invitation(invitation_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.revoke_invitation(db, ctx, invitation_id)
    await db.commit()


@router.post("/invitations/preview", response_model=InvitationPreview)
async def preview(body: InvitationTokenIn, user: CurrentUser, db: DB) -> InvitationPreview:
    return await service.preview_invitation(db, user, body.token)


@router.post("/invitations/accept", response_model=FamilyOut)
async def accept(body: InvitationTokenIn, user: CurrentUser, db: DB) -> FamilyOut:
    family = await service.accept_invitation(db, user, body.token)
    await db.commit()
    ctx = await load_family_context(db, user, family.id)
    return await service.family_out(db, ctx)
