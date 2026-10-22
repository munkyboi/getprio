function productionApprovalResponse(approval) {
  if (!approval) return null;
  return {
    id: approval.id,
    projectId: approval.projectId,
    status: approval.status,
    draft: approval.draft || {},
    approvedSubmissionId: approval.approvedSubmissionId,
    submissions: (approval.submissions || []).map((submission) => ({
      id: String(submission.id),
      version: Number(submission.version),
      snapshot: submission.snapshot || {},
      status: submission.status,
      submittedByUserId: submission.submittedByUserId ? String(submission.submittedByUserId) : null,
      submittedAt: submission.submittedAt,
      reviewerUserId: submission.reviewerUserId ? String(submission.reviewerUserId) : null,
      reviewedAt: submission.reviewedAt,
      reviewFeedback: submission.reviewFeedback || null
    }))
  };
}

module.exports = { productionApprovalResponse };
