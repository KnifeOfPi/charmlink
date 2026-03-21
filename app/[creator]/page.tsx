import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Metadata } from "next";
import creatorsData from "../../creators.json";
import { Creator, CreatorsConfig } from "../../lib/types";
import { CreatorPage } from "./CreatorPage";

const creators: CreatorsConfig = creatorsData as CreatorsConfig;

interface PageProps {
  params: Promise<{ creator: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { creator: slug } = await params;
  const creator: Creator | undefined = creators[slug];

  if (!creator) {
    return { title: "Not Found" };
  }

  return {
    title: `${creator.name} | Creator`,
    description: creator.tagline,
    openGraph: {
      title: creator.name,
      description: creator.tagline,
      images: creator.avatar ? [creator.avatar] : [],
      type: "profile",
    },
    twitter: {
      card: "summary",
      title: creator.name,
      description: creator.tagline,
    },
  };
}

export default async function CreatorPageServer({ params }: PageProps) {
  const { creator: slug } = await params;
  const creator: Creator | undefined = creators[slug];

  if (!creator) {
    notFound();
  }

  const headersList = await headers();
  const isBot = headersList.get("x-is-bot") === "true";

  return <CreatorPage creator={creator} slug={slug} isBot={isBot} />;
}
