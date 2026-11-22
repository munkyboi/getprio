import { useEffect, useState } from "react";
import { Alert, Card } from "@mantine/core";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { CustomerBookingDetailResponse } from "@shared";
import { apiRequest } from "../api/client";
import CampaignCreateForm from "../components/CampaignCreateForm";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

export default function CampaignCreatePage() {
  const { bookingId = "" } = useParams(); const navigate = useNavigate(); const { token, user, loading } = useAuth();
  const [booking, setBooking] = useState<CustomerBookingDetailResponse["booking"] | null>(null); const [error, setError] = useState("");
  useEffect(() => { if (token) apiRequest<CustomerBookingDetailResponse>(`/account/bookings/${bookingId}`, { token }).then((data) => setBooking(data.booking)).catch((next) => setError(getErrorMessage(next))); }, [bookingId, token]);
  if (loading) return null; if (!user || !token) return <Navigate replace to="/login" />;
  return <Card className="finazze-auth-card customer-account-card" p="xl">{error ? <Alert color="red">{error}</Alert> : booking ? <CampaignCreateForm booking={booking} onCreated={(campaign) => navigate(`/account/campaigns/${campaign.id}/manage`)} token={token}/> : null}</Card>;
}
