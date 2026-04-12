import EvaluatorScoreClient from './EvaluatorScoreClient';

export default async function EvaluatorScorePage({ params }: { params: Promise<{ registrationId: string }> }) {
  const { registrationId } = await params;
  return <EvaluatorScoreClient registrationId={Number(registrationId)} />;
}
