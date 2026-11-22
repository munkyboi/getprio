import { IconClock, IconCalendar, IconCreditCard, IconShieldLock, IconBuildingStore, IconMessageCircle } from '@tabler/icons-react';

export type HelpArticle = {
  id: string;
  topic: string;
  title: string;
  intro: string;
  steps: string[];
  note: string;
  link?: string;
  linkLabel?: string;
};

export const helpTopics = [
  { id: 'queues', title: 'Queues & your turn', description: 'Join a line. Keep track. Know what comes next.', Icon: IconClock },
  { id: 'bookings', title: 'Bookings & visits', description: 'From your first booking to checking in.', Icon: IconCalendar },
  { id: 'payments', title: 'Payments & refunds', description: 'Understand a payment or find the right help.', Icon: IconCreditCard },
  { id: 'account', title: 'Account & privacy', description: 'Sign in, stay secure, and manage your data.', Icon: IconShieldLock },
  { id: 'vendors', title: 'For businesses', description: 'Set up your workspace and welcome customers.', Icon: IconBuildingStore },
  { id: 'support', title: 'Contact & reporting', description: 'A little extra help when you need it.', Icon: IconMessageCircle },
];
export const helpArticles: HelpArticle[] = [
  { id: 'leave', topic: 'queues', title: 'Leave a queue', intro: 'If you no longer need your place, check the actions on your ticket.', steps: ['Open your queue ticket.', 'While your ticket is waiting, choose Cancel ticket.', 'Read the confirmation and follow any ownership verification instructions.'], note: 'If your ticket has already been called or you cannot cancel it, contact the business. For payment questions, include your ticket and payment reference when contacting support.' },
  { id: 'notifications', topic: 'queues', title: 'Keep up with queue updates', intro: 'Use your ticket page to follow your latest status.', steps: ['Keep your ticket page available while you wait.', 'If you want browser notifications, use the notification option on the ticket page and allow them in your browser.', 'If notifications are blocked, review your browser or device permissions and continue checking the ticket page.'], note: 'Email and notification delivery can be interrupted. Check your ticket for the latest information.' },
  { id: 'join', topic: 'queues', title: 'How do I join a queue?', intro: 'Your place starts with the business you want to visit.', steps: ['Open the business’s GetPrio profile or scan its queue QR code.', 'Review the location, available service, and any entry requirements shown.', 'Follow the join steps, then keep your ticket open to follow its status.'], note: 'A queue ticket is different from a scheduled booking. Check the information shown by the business before joining.' },
  { id: 'turn', topic: 'queues', title: 'Track your turn or a missed call', intro: 'Your ticket is the place to check your current queue status.', steps: ['Open your active queue ticket.', 'Check its latest status and any instructions from the business.', 'If you missed your turn, contact the business to ask what to do next.'], note: 'Wait estimates can change. Contact the business if you need help with a missed turn.' },
  { id: 'booking', topic: 'bookings', title: 'Book a service and prepare for your visit', intro: 'Review the service details before sending a booking request.', steps: ['Find the business and choose an available service.', 'Review the date, time, price, and booking requirements.', 'Submit the requested details and follow the booking status for confirmation and check-in instructions.'], note: 'A request and a confirmed booking are different states. Use the status displayed on your booking.' },
  { id: 'cancel', topic: 'bookings', title: 'Cancel or change a booking', intro: 'The options available depend on your booking’s current status.', steps: ['Open the booking and review its available actions.', 'Read any cancellation or payment consequences before confirming.', 'Contact the business if you need a different time or cannot find the action you need.'], note: 'Read the current cancellation terms before acting. Deleting your account does not automatically cancel a booking or refund a payment.', link: '/terms#cancellations-and-refunds', linkLabel: 'Read cancellation terms' },
  { id: 'payment', topic: 'payments', title: 'My payment needs attention', intro: 'Start with the payment and booking information already shown in GetPrio.', steps: ['Check whether the payment is marked pending, successful, or failed.', 'Keep the payment reference and the date of the transaction.', 'Contact the business about a booking payment. For a technical issue, send GetPrio the reference and what happened.'], note: 'Do not send passwords, verification codes, or full card details. Include the business name and booking or queue ticket reference so we can identify the transaction.' },
  { id: 'refund', topic: 'payments', title: 'Who do I contact about a refund?', intro: 'For a booking payment, start with the business you booked with.', steps: ['Locate the booking reference and payment details.', 'Explain the cancellation or payment concern to the business.', 'If you need GetPrio’s help with a platform issue, include what you have already discussed.'], note: 'The current booking terms describe vendor-handled refunds. For a queue payment, contact support with your ticket and payment reference.', link: '/terms#cancellations-and-refunds', linkLabel: 'Read the current refund terms' },
  { id: 'signin', topic: 'account', title: 'I can’t sign in', intro: 'Use the recovery options on the sign-in page.', steps: ['Check that you are using the email address associated with your account.', 'Use the password reset option if you have forgotten your password.', 'If you still cannot access your account, contact support with your account email and the error shown.'], note: 'Never share a password or verification code with anyone claiming to offer support.', link: '/login', linkLabel: 'Go to sign in' },
  { id: 'privacy', topic: 'account', title: 'Manage or delete your account data', intro: 'You can request help with access, correction, or deletion of your personal data.', steps: ['Review the account and security options available to you.', 'Read the privacy policy for what deletion affects and what records may be retained.', 'Contact GetPrio with the account concerned and the request you want to make.'], note: 'Uninstalling the app does not delete your account.', link: '/privacy-policy#choices-and-rights', linkLabel: 'Read your privacy choices' },
  { id: 'setup', topic: 'vendors', title: 'Get your business ready', intro: 'Help customers understand where to go and what to expect.', steps: ['Create your business account and complete the setup steps shown.', 'Check your business profile, location, and service details.', 'Review your queue and staff setup before sharing your public profile.'], note: 'Available features depend on your workspace and access level.', link: '/register/vendor', linkLabel: 'Create a business account' },
  { id: 'report', topic: 'support', title: 'Report a problem or safety concern', intro: 'Tell us what happened so we can route your concern.', steps: ['Include the business name and booking or ticket reference, where relevant.', 'Describe what you expected, what happened, and when.', 'Use the contact page to email GetPrio. You can attach relevant screenshots in your email app.'], note: 'Remove unrelated personal or payment information from screenshots before sending.', link: '/contact', linkLabel: 'Contact GetPrio' },
];

export const helpFaqs = [
  { question: 'Is a queue ticket the same as a booking?', answer: 'A queue ticket tracks your place in a live line. A booking is a request for a scheduled service. Check the status and instructions shown for each.' },
  { question: 'Who should I contact about my visit?', answer: 'Start with the business for availability, service details, and booking changes. GetPrio can help with account access and app issues.' },
  { question: 'Does uninstalling the app delete my account?', answer: 'No. Review the account deletion options and privacy policy, or contact GetPrio to request help with your data.' },
];

export function searchHelpArticles(query: string, topic = '') {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return helpArticles.filter(article => {
    const topicName = helpTopics.find(item => item.id === article.topic)?.title || '';
    const text = [article.title, article.intro, ...article.steps, article.note, topicName].join(' ').toLocaleLowerCase();
    return (!topic || article.topic === topic) && words.every(word => text.includes(word));
  });
}
