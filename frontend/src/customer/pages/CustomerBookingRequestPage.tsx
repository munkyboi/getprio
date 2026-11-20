import BookingRequestPage from "../../pages/BookingRequestPage";
import { CustomerBookingView } from "../components/booking/CustomerBookingView";
import { CustomerSubmittedBookingView } from "../components/booking/CustomerSubmittedBookingView";
import { CustomerResourceSelectionView } from "../components/booking/CustomerResourceSelectionView";
export default function CustomerBookingRequestPage() {
  return (
    <BookingRequestPage
      renderResourceSelection={(model) => (
        <CustomerResourceSelectionView model={model} />
      )}
      renderPresentation={(model) =>
        model.booking ? (
          <CustomerSubmittedBookingView model={model} />
        ) : (
          <CustomerBookingView model={model} />
        )
      }
    />
  );
}
