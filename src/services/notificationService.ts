export const sendPushNotification = async (
  token: string,
  title: string,
  body: string,
  orderId: string,
  type: string
) => {
  try {
    const response = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, title, body, orderId, type }),
    });

    if (!response.ok) {
      throw new Error('Failed to send push notification');
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
};
