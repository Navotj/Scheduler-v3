output "backend_instance_ip" {
  description = "Public IP of the backend EC2 instance (Node.js/Python app)"
  value       = aws_instance.backend.public_ip
}

output "backend_instance_id" {
  description = "Instance ID of the backend EC2 instance"
  value       = aws_instance.backend.id
}

output "mongodb_instance_ip" {
  description = "Public IP of the MongoDB EC2 instance"
  value       = aws_instance.mongodb.public_ip
}

output "mongodb_instance_id" {
  description = "Instance ID of the MongoDB EC2 instance"
  value       = aws_instance.mongodb.id
}
