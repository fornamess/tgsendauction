import './TopBetsList.css';

interface Bet {
  _id: string;
  amount: number;
  userId: {
    _id: string;
    username: string;
  };
}

interface TopBetsListProps {
  top100: Array<{ rank: number; bet: Bet }>;
  userBet: Bet | null;
}

function TopBetsList({ top100, userBet }: TopBetsListProps) {
  const getTopClass = (rank: number) => {
    if (rank === 1) return 'top-1';
    if (rank === 2) return 'top-2';
    if (rank === 3) return 'top-3';
    return '';
  };

  return (
    <div className="top-bets-list">
      {top100.length === 0 ? (
        <div className="empty">Пока нет ставок в этом раунде</div>
      ) : (
        <div className="bets-container">
          {top100.map(({ rank, bet }) => {
            const isUserBet = userBet && bet._id === userBet._id;
            return (
              <div
                key={bet._id}
                className={`bet-item ${getTopClass(rank)} ${isUserBet ? 'user-bet' : ''}`}
              >
                <div className="bet-rank">#{rank}</div>
                <div className="bet-user">{bet.userId.username}</div>
                <div className="bet-amount">{bet.amount.toLocaleString('ru-RU')} руб.</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TopBetsList;
