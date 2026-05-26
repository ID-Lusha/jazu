import { PrismaClient } from "@prisma/client";
import { createInitialProfile, buildFallbackPrompt } from "@jazu/ai";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@jazu.local";

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo owner"
    }
  });

  const agent = await prisma.agent.upsert({
    where: {
      id: user.id
    },
    update: {
      userId: user.id,
      name: "Demo AI Manager",
      status: "draft"
    },
    create: {
      id: user.id,
      userId: user.id,
      name: "Demo AI Manager",
      status: "draft",
      currentPrompt: ""
    }
  });

  const profile = createInitialProfile();
  const seededProfile = {
    ...profile,
    businessName: "Demo service business",
    niche: "local services",
    description: "Demo agent for a generic local business with detailed intake",
    offerings: ["Consultation", "Service booking", "FAQ handling"],
    targetAudience: "people who want to ask about services and book a time",
    geography: "online and local",
    hours: "09:00-21:00",
    pricingPolicy: "Prices can be named if available, otherwise hand off to a person",
    bookingFlow: "Clarify the type of request, ask for the needed details, then hand off or confirm the next step.",
    leadGoal: "Get the client to a qualified lead or booking request.",
    handoffRules: "Hand off when the request is complex, urgent, or needs a human decision.",
    tone: "brief, friendly and professional",
    phonePolicy: "Do not ask for a phone number twice if it is already available in WhatsApp",
    addressPolicy: "Ask the address only when it is truly needed",
    faq: ["What services do you have?", "How much does it cost?", "How soon can you respond?"],
    examples: ["Use short answers and move the client one step forward.", "Do not promise a booking that is not confirmed."],
    notAllowed: ["Do not invent prices", "Do not invent free slots", "Do not promise results you cannot guarantee"],
    integrations: ["WhatsApp"],
    emergencyCases: ["Complaints", "legal questions", "requests that need an exact price"]
  };

  const prompt = buildFallbackPrompt(seededProfile);

  await prisma.businessProfile.upsert({
    where: { agentId: agent.id },
    update: {
      data: seededProfile
    },
    create: {
      agentId: agent.id,
      data: seededProfile
    }
  });

  await prisma.promptVersion.create({
    data: {
      agentId: agent.id,
      content: prompt,
      charCount: prompt.length,
      source: "create",
      createdBy: "ai",
      metadata: { seed: true }
    }
  });

  await prisma.session.upsert({
    where: { cookieId: "demo-session" },
    update: {
      userId: user.id,
      agentId: agent.id,
      promptDraft: prompt,
      readyToFinalize: true,
      createAgentHistory: [],
      promptBuilderHistory: [],
      testBotHistory: []
    },
    create: {
      cookieId: "demo-session",
      userId: user.id,
      agentId: agent.id,
      promptDraft: prompt,
      readyToFinalize: true,
      createAgentHistory: [],
      promptBuilderHistory: [],
      testBotHistory: []
    }
  });

  await prisma.conversation.upsert({
    where: { agentId_waChatId: { agentId: agent.id, waChatId: "demo-chat" } },
    update: {},
    create: {
      agentId: agent.id,
      waChatId: "demo-chat",
      customerName: "Anna",
      status: "open",
      lastMessageAt: new Date()
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
