CREATE TABLE IF NOT EXISTS `theaters` (
  `theater_id` int NOT NULL,
  `theater_name` varchar(45) NOT NULL,
  `theater_location` varchar(45) NOT NULL,
  `theater_address` varchar(255) NOT NULL,
  `screen_amount` int NOT NULL,
  PRIMARY KEY (`theater_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `movies` (
  `movie_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `release_year` int NOT NULL,
  `rating` varchar(5) NOT NULL,
  `length` int NOT NULL,
  `description` longtext NOT NULL,
  `image` longblob DEFAULT NULL,
  PRIMARY KEY (`movie_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `users_id` int NOT NULL,
  `first_name` varchar(45) NOT NULL,
  `last_name` varchar(45) NOT NULL,
  `email_address` varchar(45) NOT NULL,
  `password` varchar(45) NOT NULL,
  `employee_permission` tinyint(1) NOT NULL DEFAULT 0,
  `admin_permission` tinyint(1) NOT NULL DEFAULT 0,
  `theater_id` int DEFAULT NULL,
  PRIMARY KEY (`users_id`),
  KEY `fk_users_theaters_idx` (`theater_id`),
  CONSTRAINT `fk_users_theaters` FOREIGN KEY (`theater_id`) REFERENCES `theaters` (`theater_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `showing` (
  `showing_id` int NOT NULL,
  `movie_id` int NOT NULL,
  `showtime` datetime NOT NULL,
  `theater_id` int NOT NULL,
  PRIMARY KEY (`showing_id`),
  KEY `fk_showing_movies_idx` (`movie_id`),
  KEY `fk_showing_theaters_idx` (`theater_id`),
  CONSTRAINT `fk_showing_movies` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`movie_id`),
  CONSTRAINT `fk_showing_theaters` FOREIGN KEY (`theater_id`) REFERENCES `theaters` (`theater_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tickets` (
  `ticket_id` varchar(255) NOT NULL,
  `movie_id` int NOT NULL,
  `showing_id` int NOT NULL,
  `user_id` int NOT NULL,
  `purchase_time` timestamp NOT NULL,
  `ticket_amount` int NOT NULL,
  PRIMARY KEY (`ticket_id`),
  KEY `fk_tickets_showing_idx` (`showing_id`),
  KEY `fk_tickets_users_idx` (`user_id`),
  KEY `fk_tickets_movies_idx` (`movie_id`),
  CONSTRAINT `fk_tickets_movies` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`movie_id`),
  CONSTRAINT `fk_tickets_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`users_id`),
  CONSTRAINT `fk_tickets_showing` FOREIGN KEY (`showing_id`) REFERENCES `showing` (`showing_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
