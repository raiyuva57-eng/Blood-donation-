function createRealtime(io) {
  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    socket.on('join', ({ userId, role }) => {
      if (!userId) return;
      onlineUsers.set(userId, socket.id);
      socket.join(`user:${userId}`);
      socket.join(`role:${role || 'guest'}`);
      io.emit('presence:update', { onlineCount: onlineUsers.size });
    });

    socket.on('dashboard:watch', ({ bloodGroup, city }) => {
      if (bloodGroup) socket.join(`blood:${bloodGroup}`);
      if (city) socket.join(`city:${city.toLowerCase()}`);
    });

    socket.on('disconnect', () => {
      for (const [userId, id] of onlineUsers.entries()) {
        if (id === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
      io.emit('presence:update', { onlineCount: onlineUsers.size });
    });
  });

  function notifyUser(userId, event, payload) {
    io.to(`user:${userId}`).emit(event, payload);
  }

  function notifyRole(role, event, payload) {
    io.to(`role:${role}`).emit(event, payload);
  }

  function notifyCity(city, event, payload) {
    io.to(`city:${String(city).toLowerCase()}`).emit(event, payload);
  }

  function broadcast(event, payload) {
    io.emit(event, payload);
  }

  return {
    notifyUser,
    notifyRole,
    notifyCity,
    broadcast
  };
}

module.exports = createRealtime;
