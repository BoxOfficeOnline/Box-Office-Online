CREATE TABLE IF NOT EXISTS `tickets` (
  `ticket_id` varchar(255) NOT NULL,
  `movie_id` int NOT NULL,
  `showing_id` int NOT NULL,
  `user_id` int NOT NULL,
  `purchase_time` timestamp NOT NULL,
  `ticket_amount` int NOT NULL,
  PRIMARY KEY (`ticket_id`),
  UNIQUE KEY `ticket_id_UNIQUE` (`ticket_id`),
  KEY `fk_tickets_showing1_idx` (`showing_id`),
  KEY `fk_tickets_users1_idx` (`user_id`),
  KEY `fk_tickets_movies1` (`movie_id`),
  CONSTRAINT `fk_tickets_movies1` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`movie_id`),
  CONSTRAINT `fk_tickets_users1` FOREIGN KEY (`user_id`) REFERENCES `users` (`users_id`),
  CONSTRAINT `fk_tickets_showing1` FOREIGN KEY (`showing_id`) REFERENCES `showing` (`showing_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
