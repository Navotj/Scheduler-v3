resource "aws_security_group" "mongodb_access" {
  name        = "mongodb-access"
  description = "No inbound; MongoDB reachable only via SSM"
  vpc_id      = data.aws_vpc.default.id

  # No ingress: DB access is via SSM port forwarding only.
  # Keep wide egress so the SSM agent can reach AWS endpoints over 443.
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "mongodb-access"
  }
}

resource "aws_security_group" "backend_access" {
  name        = "backend-access"
  description = "Backend app traffic"
  vpc_id      = data.aws_vpc.default.id

  # NOTE: Without an ALB/CloudFront front-door, the frontend (S3 website) is not a network peer.
  # This keeps HTTP open so browsers can reach the backend.
  # To hard-restrict to a true front-door later, change this to only allow from the ALB SG.
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH disabled; use SSM for management.
  # (No ingress rule for 22.)

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "backend-access"
  }
}
