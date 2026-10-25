import { NextResponse } from "next/server";
import {
  liveCastVote,
  liveFileChallenge,
  liveGetDisclosureState,
  liveGetVersionChain,
  liveGetVotingState,
  liveVerifyVersionChain,
} from "../../../../lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  const search = new URL(request.url).searchParams;
  const proposalId = search.get("proposalId");
  const govId = search.get("govId");
  try {
    if (action === "version-chain" && proposalId) {
      return NextResponse.json(await liveGetVersionChain(proposalId));
    }
    if (action === "verify-chain" && proposalId) {
      return NextResponse.json(await liveVerifyVersionChain(proposalId));
    }
    if (action === "disclosure-state" && proposalId) {
      return NextResponse.json(await liveGetDisclosureState(proposalId));
    }
    if (action === "voting-state" && govId) {
      return NextResponse.json(await liveGetVotingState(govId));
    }
    return NextResponse.json({ error: "Unknown action or missing identifier." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (action === "vote" && typeof body.govId === "string" && typeof body.withBrief === "boolean") {
      const briefHash = typeof body.briefHash === "string" ? body.briefHash : undefined;
      return NextResponse.json(await liveCastVote(body.govId, body.withBrief, briefHash));
    }
    if (
      action === "challenge" &&
      typeof body.proposalId === "string" &&
      typeof body.linkEvidenceHash === "string" &&
      typeof body.description === "string"
    ) {
      return NextResponse.json(await liveFileChallenge(
        body.proposalId,
        body.linkEvidenceHash,
        body.description
      ));
    }
    return NextResponse.json({ error: "Invalid live action payload." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
